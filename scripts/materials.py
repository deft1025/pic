#!/usr/bin/env python3
"""Local book production with MySQL as the editable source of truth.

Book JSON is exchanged in memory or an automatically removed temporary file;
content/books is never read or modified by this entry point.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def module(name):
    spec = importlib.util.spec_from_file_location('pic_materials_' + name, ROOT/'scripts'/f'{name}.py')
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


class Store:
    def __init__(self, config=None):
        self.config = Path(config).resolve() if config else None

    def call(self, action, book_id=None, payload=None, metadata_only=False):
        binary = os.environ.get('PIC_MATERIALS_BIN')
        command = [binary, action] if binary else ['go', 'run', './cmd/materials', action]
        if self.config:
            command += ['--config', str(self.config)]
        if book_id:
            command += ['--book', book_id]
        if metadata_only:
            command += ['--metadata-only']
        result = subprocess.run(command, cwd=ROOT, input=json.dumps(payload, ensure_ascii=False) if payload is not None else None,
                                text=True, capture_output=True, timeout=180)
        if result.returncode:
            raise RuntimeError(result.stderr.strip() or '数据库物料操作失败')
        return json.loads(result.stdout)

    def read(self, book_id):
        return self.call('read', book_id)

    def save(self, snapshot):
        return self.call('save', payload=snapshot)


def standard_audio(book, language, profile):
    """Recognize already generated speech even after local uploaded files were removed."""
    text_key = 'text_zh' if language == 'zh' else 'text_original'
    audio_key = 'audio_zh' if language == 'zh' else 'audio_original'
    signature = json.dumps([profile['voice'], profile['rate'], [(p['page_number'], p[text_key]) for p in book['pages']]], ensure_ascii=False).encode()
    revision = hashlib.sha256(signature).hexdigest()[:16]
    voice = book.get('voices', {}).get(language, {})
    return bool(book['pages']) and voice.get('provider') == 'edge-tts' and voice.get('voice_id') == profile['voice'] and all(
        p.get(audio_key) == f"/assets/books/{book['id']}/audio/{language}/{revision}/page-{p['page_number']:03}.mp3" for p in book['pages'])


def make_audio(store, book_id, language='both', force=False, preview=False):
    audio = module('generate_audio')
    profiles = json.loads((ROOT/'config/audio.json').read_text())
    languages = ['zh', 'en'] if language == 'both' else [language]
    for lang in languages:
        snapshot = store.read(book_id)
        book = snapshot['book']
        if lang not in book['languages']:
            raise ValueError('书目不包含所选语言：' + lang)
        if not force and not preview and standard_audio(book, lang, profiles[lang]):
            print(f'{book_id} {lang}: 数据库已记录相同正文与参数的完整配音，未重生成。')
            continue
        # The existing synthesis implementation writes only its automatically
        # generated scratch snapshot. Commit to MySQL after the entire book succeeds.
        with tempfile.TemporaryDirectory(prefix='pic-material-audio-') as folder:
            path = Path(folder)/'book.json'
            path.write_text(json.dumps(book, ensure_ascii=False))
            args = [str(path), '--language', lang]
            if force:
                args.append('--force')
            if preview:
                args.append('--preview')
            audio.main(args)
            if not preview:
                snapshot['book'] = json.loads(path.read_text())
                store.save(snapshot)
                print(f'{book_id} {lang}: 整本配音路径及声音记录已写回 MySQL。')


def package(store, book_id, root=None):
    book = store.read(book_id)['book']
    return module('package_assets').package_assets(root or ROOT, book_id, books=[book])


def make_art(store, book_id, source_dir=None):
    snapshot = store.read(book_id)
    book = snapshot['book']
    evidence = json.loads((ROOT/'content/sources/bookdash-originals/sources.json').read_text())
    if book_id in evidence:
        if not source_dir:
            source_dir = ROOT/'docs/materials-review'/('original-sources-' + evidence[book_id]['downloaded_on'].replace('-', ''))
        module('prepare_original_books').prepare(Path(source_dir), art_only=True, books=[book_id])
        book['cover'] = f'/assets/books/{book_id}/cover.jpg'
        for page in book['pages']:
            page['image'] = f"/assets/books/{book_id}/page-{page['page_number']:03}.jpg"
        digest = hashlib.sha256()
        for ref in [book['cover'], *[p['image'] for p in book['pages']]]:
            digest.update((ROOT/'web'/ref.lstrip('/')).read_bytes())
        book['content_version'] = 'bookdash-original-v1-' + digest.hexdigest()[:12]
    else:
        # Keep the existing storyboard renderer, but give it only the requested
        # database book and a disposable config/snapshot, never the whole library.
        boards = json.loads((ROOT/'config/illustrations.json').read_text())
        if book_id not in boards:
            raise ValueError('此书没有已实现的分镜，不能用通用模板生成插画：' + book_id)
        with tempfile.TemporaryDirectory(prefix='pic-material-art-') as folder:
            path = Path(folder)/f'{book_id}.json'
            path.write_text(json.dumps(book, ensure_ascii=False))
            config = Path(folder)/'illustrations.json'
            config.write_text(json.dumps({book_id: boards[book_id]}, ensure_ascii=False))
            module('illustrate_books').generate(folder, ROOT/'web', config)
            book = json.loads(path.read_text())
    snapshot['book'] = book
    store.save(snapshot)
    print(book_id + ': 图片路径及内容版本已写回 MySQL。')


def snapshot_tests(store, destination=None):
    """Generated test input, never a production editing or import source."""
    books = [store.read(book_id)['book'] for book_id in store.call('list')]
    destination = Path(destination or ROOT/'tests/fixtures/library.json')
    destination.parent.mkdir(parents=True, exist_ok=True)
    data = {'note': '由 scripts/materials.py snapshot-tests 从 MySQL 自动生成，仅供离线测试；禁止人工维护或导入运营库。', 'books': books}
    with tempfile.NamedTemporaryFile('w', dir=destination.parent, suffix='.tmp', delete=False, encoding='utf-8') as handle:
        temporary = Path(handle.name)
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write('\n')
    try:
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    print(f'已自动生成离线测试快照：{len(books)} 本；未写库。')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['list', 'show', 'validate', 'audio', 'art', 'package', 'prepare', 'snapshot-tests'])
    parser.add_argument('--book', help='业务 ID；除 list 外必填，避免误生成全库')
    parser.add_argument('--db-config', type=Path, help='数据库.env配置，默认项目根目录.env')
    parser.add_argument('--language', choices=['zh', 'en', 'both'], default='both')
    parser.add_argument('--force', action='store_true', help='明确要求重生成本书音频')
    parser.add_argument('--preview', action='store_true', help='只生成第一页试听，不写库')
    parser.add_argument('--source-dir', type=Path, help='原画源图目录，默认按来源记录选择批次')
    args = parser.parse_args(argv)
    if args.action not in ['list', 'snapshot-tests'] and (not args.book or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}', args.book)):
        parser.error('请用 --book 指定一本有效书目 ID')
    if args.preview and args.action != 'audio':
        parser.error('--preview 仅用于 audio')
    store = Store(args.db_config)
    if args.action == 'snapshot-tests':
        snapshot_tests(store)
    elif args.action == 'list':
        for book_id in store.call('list'):
            print(book_id)
    elif args.action == 'show':
        b = store.read(args.book)['book']
        print(f"{b['id']} · {b['title_zh']} · {len(b['pages'])} 页 · {b['publish_status']}")
        print('推荐理由：' + (b.get('reading_value') or '待补充'))
    elif args.action == 'validate':
        store.call('validate', args.book)
        print(args.book + ': 数据库资料及本地/远程素材校验通过，未写库。')
    else:
        if args.action == 'art':
            make_art(store, args.book, args.source_dir)
        if args.action in ['audio', 'prepare']:
            make_audio(store, args.book, args.language, args.force, args.preview)
        if args.action in ['package', 'prepare']:
            output, stats = package(store, args.book)
            print(f"打包完成：{output}\n{stats['pages']} 页，{stats['files']} 个素材文件；在 /root/www/pic/assets/books 解压。")
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError) as error:
        print('物料未完成：' + str(error), file=sys.stderr)
        sys.exit(1)
