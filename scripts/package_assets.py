#!/usr/bin/env python3
"""Package all live book assets, or one book, without macOS auxiliary files."""
import argparse
import importlib.util
import json
from pathlib import Path, PurePosixPath
import re
import sys
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('pic_content_validation', Path(__file__).with_name('import_books.py'))
content = importlib.util.module_from_spec(spec)
spec.loader.exec_module(content)


def package_assets(root, book_id=None):
    root = Path(root)
    if book_id is not None and not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}', book_id):
        raise ValueError('书目 ID 必须是 1–64 位字母、数字、下划线或连字符')
    manifests = [root/'content/books'/f'{book_id}.json'] if book_id else sorted((root/'content/books').glob('*.json'))
    if not manifests:
        raise ValueError('没有可打包的绘本资料')
    web = root/'web'
    sources = {}
    ids = set()
    pages = 0
    for manifest in manifests:
        book = json.loads(manifest.read_text(encoding='utf-8'))
        if book['id'] in ids or (book_id and book['id'] != book_id):
            raise ValueError('书目 ID 重复或与指定书目不一致')
        paths = content.validate(book, web)
        ids.add(book['id'])
        pages += len(book['pages'])
        for path in paths:
            if any(part.startswith('._') or part in {'.DS_Store', '__MACOSX', 'Thumbs.db', 'desktop.ini'} for part in PurePosixPath(path).parts):
                raise ValueError('资料不能引用系统辅助文件：' + path)
            if book_id and not path.startswith('/assets/books/' + book_id + '/'):
                raise ValueError('单书包的资源必须位于 /assets/books/' + book_id + '/')
            sources[path] = content.asset_path(path, web)
    # The full package can also restore the site's local decorative image.
    if not book_id and (web/'assets/hero.svg').is_file():
        sources['/assets/hero.svg'] = content.asset_path('/assets/hero.svg', web)
    output = web/'assets/books'/f'{book_id}.tar.gz' if book_id else root/'pic-book-assets.tar.gz'
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=output.parent, suffix='.tmp', delete=False) as handle:
        temporary = Path(handle.name)
    try:
        with tarfile.open(temporary, 'w:gz', format=tarfile.PAX_FORMAT) as archive:
            for path, source in sorted(sources.items()):
                name = path.removeprefix('/assets/books/') if book_id else path.lstrip('/')
                info = archive.gettarinfo(str(source), arcname=name)
                if not info.isfile():
                    raise ValueError('只允许打包普通素材文件：' + path)
                info.uid = info.gid = 0
                info.uname = info.gname = ''
                info.mode = 0o644
                info.mtime = int(info.mtime)
                info.pax_headers = {}
                with source.open('rb') as handle:
                    archive.addfile(info, handle)
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)
    return output, {'books': len(ids), 'pages': pages, 'files': len(sources)}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--book', help='只打包指定书目；省略则生成完整素材包')
    args = parser.parse_args(argv)
    try:
        output, stats = package_assets(ROOT, args.book)
    except (OSError, ValueError, KeyError, TypeError, tarfile.TarError) as error:
        print('打包失败：' + str(error), file=sys.stderr)
        return 1
    print(f"打包完成：{output}\n{stats['books']} 本、{stats['pages']} 页、{stats['files']} 个素材文件，{output.stat().st_size / 1024 / 1024:.1f} MiB")
    print('包内不含 .DS_Store、._*、缓存、JSON 或其他压缩包。')
    print('服务器解压目录：/root/www/pic/assets/books' if args.book else '服务器解压目录：/root/www/pic')
    return 0


if __name__ == '__main__':
    sys.exit(main())
