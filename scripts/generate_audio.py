#!/usr/bin/env python3
"""Pre-generate per-page MP3 files using an installed edge-tts command."""
import argparse
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

ROOT=Path(__file__).resolve().parents[1]
DEFAULT_AUDIO_CONFIG=ROOT/'config/audio.json'

def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('book',type=Path,nargs='?',help='仅兼容历史JSON文件/目录；日常使用 --book 业务ID查库')
    p.add_argument('--book',dest='database_book',help='从MySQL读取指定书目，整本成功后写回配音记录')
    p.add_argument('--db-config',type=Path,help='数据库.env配置文件')
    p.add_argument('--config',type=Path,default=DEFAULT_AUDIO_CONFIG,help='配音配置文件，默认 config/audio.json')
    p.add_argument('--language',choices=['zh','en'],default='zh')
    p.add_argument('--voice',help='覆盖配置中的音色')
    p.add_argument('--rate',help='覆盖配置中的生成语速；负值用 --rate=-20%% 写法')
    p.add_argument('--preview',action='store_true',help='只生成第一页试听，不修改绘本 JSON，不入库')
    p.add_argument('--force',action='store_true')
    args=p.parse_args(argv)
    if args.database_book:
        if args.book or args.voice or args.rate or args.config != DEFAULT_AUDIO_CONFIG:
            p.error('数据库模式请只指定 --book，并沿用 config/audio.json 中的已确认配音参数')
        spec=importlib.util.spec_from_file_location('pic_db_materials',Path(__file__).with_name('materials.py'))
        materials=importlib.util.module_from_spec(spec);spec.loader.exec_module(materials)
        materials.make_audio(materials.Store(args.db_config),args.database_book,args.language,args.force,args.preview)
        return
    if not args.book:p.error('请用 --book 指定数据库书目ID')
    try:
        profile=json.loads(args.config.read_text(encoding='utf-8'))[args.language]
        voice=args.voice if args.voice is not None else profile['voice']
        rate=args.rate if args.rate is not None else profile['rate']
    except (OSError,ValueError,KeyError,TypeError):
        p.error('无法读取配音配置，请检查 config/audio.json 或 --config 路径')
    if not isinstance(voice,str) or not re.fullmatch(r'[A-Za-z0-9-]+',voice):
        p.error('音色 ID 无效')
    if not isinstance(rate,str) or not re.fullmatch(r'[+-]\d+%',rate) or not -50<=int(rate[:-1])<=50:
        p.error('语速必须是 -50% 到 +50% 的整数，例如 --rate=-20%')
    executable=shutil.which('edge-tts')
    command=[executable] if executable else [sys.executable,'-m','edge_tts'] if importlib.util.find_spec('edge_tts') else None
    if not command:p.error('缺少 edge-tts，请先执行 python3 -m pip install edge-tts；此脚本需要联网。')
    paths=sorted(args.book.glob('*.json')) if args.book.is_dir() else [args.book]
    if not paths:p.error('目录中没有绘本 JSON')
    if args.preview and len(paths)!=1:p.error('试听请指定一本绘本 JSON')
    # Validate every source before generating the first book in a batch.
    books=[]
    for path in paths:
        try:b=json.loads(path.read_text(encoding='utf-8'))
        except (OSError,ValueError):p.error('无法读取绘本 JSON：'+path.name)
        if args.book.is_dir() and b.get('publish_status') == 'offline':
            print('跳过下架绘本：'+path.name)
            continue
        if args.language not in b.get('languages',[]):p.error(path.name+' 不包含所选语言')
        if not b.get('pages'):p.error(path.name+' 没有可配音的页面')
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}',b.get('id','')):p.error('绘本 ID 必须是 1–64 位字母、数字、下划线或连字符，以字母或数字开头')
        text_key='text_zh' if args.language=='zh' else 'text_original'
        if any(not isinstance(page.get(text_key),str) or not page[text_key].strip() for page in b['pages']):p.error(path.name+' 包含空的朗读文本')
        books.append((path,b))
    for path,b in books:
        generate_book(b,path,args.language,voice,rate,args.preview,args.force,command)

def generate_book(b,book_path,language,voice,rate,preview,force,command):
    text_key='text_zh' if language=='zh' else 'text_original'
    audio_key='audio_zh' if language=='zh' else 'audio_original'
    def generate(text,dest):
        dest.parent.mkdir(parents=True,exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=dest.parent,suffix='.mp3',delete=False) as f:
            temp=Path(f.name)
        try:
            subprocess.run([*command,'--voice',voice,'--rate='+rate,'--text',text,'--write-media',str(temp)],check=True,timeout=120,capture_output=True,text=True)
            if not temp.exists() or temp.stat().st_size<100:raise RuntimeError('音频生成为空')
            temp.replace(dest)
        finally:temp.unlink(missing_ok=True)
    if preview:
        dest=ROOT/'web/assets/audio-previews'/f"{b['id']}-{language}-preview.mp3"
        generate(b['pages'][0][text_key],dest)
        print('第一页试听已生成（未修改书目、未入库）：'+str(dest))
        print('浏览器试听：http://127.0.0.1:8198/'+str(dest.relative_to(ROOT/'web')))
        return
    # Include text and generation settings in resource paths. A changed voice/rate
    # cannot reuse old files, overwrite live audio, or leave browsers on cached audio.
    signature=json.dumps([voice,rate,[(page['page_number'],page[text_key]) for page in b['pages']]],ensure_ascii=False).encode('utf-8')
    revision=hashlib.sha256(signature).hexdigest()[:16]
    out=ROOT/'web/assets/books'/b['id']/'audio'/language/revision;out.mkdir(parents=True,exist_ok=True)
    # Do not update a manifest until every audio file was produced successfully.
    for page in b['pages']:
        dest=out/f"page-{page['page_number']:03}.mp3"
        if force or not dest.exists() or dest.stat().st_size<100:
            generate(page[text_key],dest)
        page[audio_key]='/'+str(dest.relative_to(ROOT/'web'))
        print(f"{b['id']} {language} {page['page_number']}/{len(b['pages'])}")
    b.setdefault('voices',{})[language]={'provider':'edge-tts','voice_id':voice,'generated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'review_status':'pending'}
    with tempfile.NamedTemporaryFile('w',dir=book_path.parent,suffix='.tmp',delete=False,encoding='utf-8') as f:
        json.dump(b,f,ensure_ascii=False,indent=2);f.write('\n');temp=Path(f.name)
    temp.replace(book_path)
    print('整本音频已生成。')
if __name__=='__main__':
    try:main()
    except subprocess.CalledProcessError as error:
        detail=error.stderr.strip().splitlines()[-1] if error.stderr else '语音服务调用失败'
        print('配音未完成：'+detail+'\n未提交失败阶段的书目改动；可修复网络后重试。',file=sys.stderr)
        sys.exit(1)
    except (subprocess.TimeoutExpired,OSError,RuntimeError) as error:
        print('配音未完成：'+str(error)+'\n未提交失败阶段的书目改动；可修复问题后重试。',file=sys.stderr)
        sys.exit(1)
