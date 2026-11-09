#!/usr/bin/env python3
"""Validate and import standard book manifests with local assets; no CMS required."""
import argparse
import datetime
import json
import shutil
import sys
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
AGES = {'0-2','3-4','5-6'}
CATEGORIES = {'animals','habits','emotions','bedtime','nature','cognition'}

def asset_path(value, web_root):
    if not isinstance(value,str) or not value.startswith('/assets/') or any(c in value for c in ('\\','?','#')) or unquote(value) != value or any(p in ('.','..') for p in value.split('/')):
        raise ValueError(f'资源必须使用 /assets/ 下的安全路径：{value!r}')
    path = (web_root / value.lstrip('/')).resolve()
    if not path.is_relative_to(web_root.resolve()) or not path.is_file() or path.stat().st_size == 0:
        raise ValueError(f'资源不存在或为空：{value}')
    if path.suffix.lower() not in {'.svg','.webp','.png','.jpg','.jpeg','.avif','.mp3','.wav','.ogg','.m4a'}:
        raise ValueError(f'不支持的资源格式：{value}')
    return path

def validate(book, web_root, require_approval=False):
    for field in ('id','title_zh','description_zh','author','illustrator','content_version'):
        if not isinstance(book.get(field),str) or not book[field].strip():
            raise ValueError(f'缺少字段：{field}')
    bid = book['id']
    if any(c in bid for c in '/\\. ') or not bid:
        raise ValueError('无效绘本 ID')
    if book.get('publish_status') not in ('published','draft','offline'):
        raise ValueError('无效发布状态')
    for key, choices in (('age_ranges',AGES),('categories',CATEGORIES),('languages',{'zh','en'})):
        values=book.get(key)
        if not isinstance(values,list) or not values or len(values)!=len(set(values)) or not set(values)<=choices:
            raise ValueError(f'无效字段：{key}')
    license = book.get('license',{})
    if license.get('review_status') not in ('pending','approved','rejected') or not license.get('type') or not license.get('attribution'):
        raise ValueError('需保留完整授权类型、署名及审核状态')
    if require_approval and book['publish_status']=='published':
        if license['review_status']!='approved' or not all(license.get(k) is True for k in ('commercial_use','self_hosting','translation_allowed','audio_derivative_allowed')):
            raise ValueError('已启用审核门槛：发布需完整授权审核')
    pages = book.get('pages')
    if not isinstance(pages,list) or not pages or book.get('page_count')!=len(pages):
        raise ValueError('页数与 pages 不一致')
    paths=[book.get('cover')]
    for n,page in enumerate(pages,1):
        if page.get('page_number')!=n or not page.get('image_alt'):
            raise ValueError(f'第 {n} 页序号或图片描述无效')
        for lang,key in (('zh','text_zh'),('en','text_original')):
            if lang in book['languages'] and not page.get(key):
                raise ValueError(f'第 {n} 页缺少 {lang} 文本')
        paths.append(page.get('image'))
        paths += [page[k] for k in ('audio_zh','audio_original') if page.get(k)]
    for asset in paths:
        asset_path(asset,web_root)
    # A configured voice implies complete page audio coverage in that language.
    voices=book.get('voices',{})
    if not isinstance(voices,dict):
        raise ValueError('语音配置必须是按语言组织的对象')
    for lang,voice in voices.items():
        if not isinstance(voice,dict) or any(not isinstance(voice.get(k),str) or not voice[k].strip() for k in ('provider','voice_id','generated_at')) or voice.get('review_status') not in ('pending','approved','rejected'):
            raise ValueError(f'{lang} 语音生产记录不完整')
        try:
            generated=datetime.datetime.fromisoformat(voice['generated_at'])
            if generated.tzinfo is None:raise ValueError()
        except ValueError:
            raise ValueError(f'{lang} 语音生成时间必须含时区')
        key='audio_zh' if lang=='zh' else 'audio_original'
        if lang not in book['languages'] or not all(p.get(key) for p in pages):
            raise ValueError(f'{lang} 语音配置需要每页都有音频')
    return paths

def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path,help='一个 JSON 或包含 JSON 的目录')
    parser.add_argument('--validate-only',action='store_true')
    parser.add_argument('--config',type=Path,help='传给 Go 导入器的配置文件（默认自动读取项目 .env）')
    parser.add_argument('--files-only',action='store_true',help='只整理 JSON 与素材，不导入 MySQL')
    parser.add_argument('--web-root',type=Path,default=ROOT/'web',help='源素材所在的 web 根目录，需含 assets/')
    parser.add_argument('--content-dir',type=Path,default=ROOT/'content/books')
    parser.add_argument('--publish-status',choices=['published','draft','offline'],help='显式设置导入状态；未提供时保留原状态')
    parser.add_argument('--require-approval',action='store_true',help='可选启用授权发布门槛；初期默认关闭')
    args=parser.parse_args(argv)
    manifests=sorted(args.source.glob('*.json')) if args.source.is_dir() else [args.source]
    if not manifests:
        parser.error('未找到绘本 JSON')
    batch=[];ids=set()
    try:
        # Validate the entire batch before copying or replacing any book.
        for path in manifests:
            b=json.loads(path.read_text())
            if args.publish_status:b['publish_status']=args.publish_status
            if b['id'] in ids:raise ValueError('批次内 ID 重复：'+b['id'])
            ids.add(b['id']); assets=validate(b,args.web_root,args.require_approval);batch.append((b,assets))
        if not args.validate_only:
            args.content_dir.mkdir(parents=True,exist_ok=True)
            for b,assets in batch:
                for asset in assets:
                    src=asset_path(asset,args.web_root);dest=ROOT/'web'/asset.lstrip('/')
                    if src!=dest.resolve():
                        dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dest)
                # Atomic replacement prevents readers observing partial JSON writes.
                with tempfile.NamedTemporaryFile('w',dir=args.content_dir,suffix='.tmp',delete=False,encoding='utf-8') as out:
                    json.dump(b,out,ensure_ascii=False,indent=2);out.write('\n');tmp=Path(out.name)
                tmp.replace(args.content_dir/f"{b['id']}.json")
        if not args.validate_only and not args.files_only:
            # Import only this batch, not unrelated JSON files in the content directory.
            with tempfile.TemporaryDirectory(prefix='pic-import-') as stage:
                for b,_ in batch:
                    (Path(stage)/f"{b['id']}.json").write_text(json.dumps(b,ensure_ascii=False))
                command=['go','run','./cmd/importer','--content',stage,'--web',str(ROOT/'web')]
                if args.config:command.extend(['--config',str(args.config.resolve())])
                env=None
                if args.require_approval:
                    import os
                    env={**os.environ,'REQUIRE_LICENSE_APPROVAL':'true'}
                subprocess.run(command,cwd=ROOT,check=True,env=env)
        print(f"{'校验通过' if args.validate_only else '导入完成'}：{len(batch)} 本绘本，{sum(len(b['pages']) for b,_ in batch)} 页。")
        if not args.validate_only:print('资料已整理，需运行 cmd/importer 写入 MySQL。' if args.files_only else 'MySQL 已更新，接口立即生效，无需重启。')
        return 0
    except (OSError,ValueError,KeyError,TypeError,subprocess.CalledProcessError) as e:
        print(f'导入失败：{e}',file=sys.stderr);return 1

if __name__=='__main__':sys.exit(main())
