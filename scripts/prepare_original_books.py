#!/usr/bin/env python3
"""Prepare the four reviewed Book Dash original-art bilingual editions locally.

Requires Pillow and opencv-python-headless; source downloads are separate.
Never connects to MySQL or uploads files. Existing matching audio is preserved.
"""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'content/sources/bookdash-originals'
PROFILES = {
    'bd-come-stay-with-me': (['3-4'], ['animals', 'emotions', 'bedtime'], 11,
        '乌龟奶奶受伤了，小乌龟到兔子朋友家暂住。一起玩耍、入睡，再迎接家人回来，感受朋友的陪伴与关心。'),
    'bd-best-friends': (['3-4', '5-6'], ['animals', 'emotions'], 12,
        '好朋友没来上学，津齐该和谁玩呢？从一起做康复卡片开始，她发现：交新朋友，也能珍惜老朋友。'),
    'bd-little-goat': (['0-2', '3-4'], ['animals', 'nature', 'emotions'], 13,
        '小山羊一路寻找最甜的青草，没发现自己离妈妈越来越远。清淡水彩与重复句式，适合亲子指图、预测与复述。'),
    'bd-fifi-and-teddy': (['3-4'], ['habits', 'emotions'], 14,
        '菲菲最喜欢的泰迪熊不见了！她找床上、找窗外，最后发现泰迪只是洗了个澡。温暖水彩讲述依恋、担心和重逢。'),
}


def remove_typesetting(image, regions):
    import cv2
    import numpy as np
    pixels = np.array(image.convert('RGB'))
    gray = cv2.cvtColor(pixels, cv2.COLOR_RGB2GRAY)
    height, width = gray.shape
    mask = np.zeros_like(gray)
    white_regions = []
    for region in regions:
        x, y, w, h = region['box']
        padding = max(5, int(width * .007))
        x0, y0 = max(0, int(x * width) - padding), max(0, int(y * height) - 4)
        x1, y1 = min(width, int((x + w) * width) + padding), min(height, int((y + h) * height) + 5)
        roi = gray[y0:y1, x0:x1]
        # Curved lettering can sit on watercolour edges. A reviewed absolute
        # threshold removes only the dark ink, keeping the pale painted edge.
        if 'ink_threshold' in region:
            ink = (roi < region['ink_threshold']).astype('uint8') * 255
            mask[y0:y1, x0:x1] = np.maximum(mask[y0:y1, x0:x1], ink)
            continue
        # Reviewed boxes contain typesetting, with background lighter than ink.
        # Mask the ink only, preserving paper/watercolour texture around it.
        background = float(np.percentile(roi, 85))
        if background >= 254.5:
            white_regions.append((x0, y0, x1, y1))
        ink = (roi < background - 18).astype('uint8') * 255
        mask[y0:y1, x0:x1] = np.maximum(mask[y0:y1, x0:x1], ink)
    mask = cv2.dilate(mask, np.ones((3, 3), dtype='uint8'))
    result = cv2.inpaint(pixels, mask, 4, cv2.INPAINT_TELEA)
    for x0, y0, x1, y1 in white_regions:
        result[y0:y1, x0:x1] = 255
    from PIL import Image
    return Image.fromarray(result)


def prepare(source_dir, art_only=False, books=None):
    from PIL import Image
    config = json.loads((ROOT / 'config/original_art.json').read_text())
    evidence = json.loads((SOURCE / 'sources.json').read_text())
    selected = books or list(PROFILES)
    for book_id in selected:
        if book_id not in evidence or book_id not in config:
            raise ValueError('未找到原画来源或清理配置：' + book_id)
        if not art_only and book_id not in PROFILES:
            raise ValueError('此书的正文与对白直接维护 content/books/' + book_id + '.json；整理图片请使用 --art-only')
        story = json.loads((SOURCE / (book_id.removeprefix('bd-') + '.json')).read_text())
        output = ROOT / 'web/assets/books' / book_id
        output.mkdir(parents=True, exist_ok=True)
        asset_hash = hashlib.sha256()
        asset_hash.update(json.dumps(story, ensure_ascii=False, sort_keys=True).encode())
        for item in evidence[book_id]['images']:
            raw = source_dir / item['source_file']
            if hashlib.sha256(raw.read_bytes()).hexdigest() != item['sha256']:
                raise ValueError('原图哈希不匹配：' + str(raw))
            with Image.open(raw) as image:
                image = image.convert('RGB')
                number = item['page_number']
                if number:
                    image = remove_typesetting(image, config[book_id]['pages'][str(number)]['text_regions'])
                max_width = config[book_id].get('max_width' if number else 'max_cover_width')
                if max_width and image.width > max_width:
                    image = image.resize((max_width, round(image.height * max_width / image.width)), Image.Resampling.LANCZOS)
                name = 'cover.jpg' if number == 0 else f'page-{number:03}.jpg'
                destination = output / name
                image.save(destination, quality=94, subsampling=0, optimize=True)
                asset_hash.update(destination.read_bytes())
        if art_only:
            print(f'{book_id}: 图片已整理，未修改书目或音频引用。')
            continue
        ages, categories, featured, description = PROFILES[book_id]
        pages = [dict(page, image=f"/assets/books/{book_id}/page-{page['page_number']:03}.jpg") for page in story['pages']]
        addition = story['narration_additions']
        note = ('原作无字跨页补充了中英文朗读串词，页码：' + ','.join(map(str, addition)) + '。') if addition else ''
        attribution = (f"原作《{story['en']}》由 Book Dash 发布；作者 {story['writer']}，原插画 {story['illustrator']}，"
            f"设计 {story['designer']}，编辑 {story['editor']}。采用 CC BY 4.0（{story['license_url']}）。"
            '本版由小小绘本馆 AI 辅助中文翻译，使用原作插画并清理原图英文排版，双语正文置于图外；'
            '图片经过版式整理，非原版整页排版。不表示原作者或 Book Dash 为本产品背书。' + note)
        manifest = ROOT / 'content/books' / (book_id + '.json')
        old = json.loads(manifest.read_text()) if manifest.exists() else {}
        book = dict(id=book_id, title_zh=story['title'], title_original=story['en'],
            author=story['writer'], illustrator=story['illustrator'], description_zh=description,
            age_ranges=ages, categories=categories, languages=['zh', 'en'],
            cover=f'/assets/books/{book_id}/cover.jpg', page_count=len(pages), reading_minutes=4,
            featured_order=featured, published_at='2026-11-10T15:00:00+08:00', publish_status='published',
            content_version='bookdash-original-v1-' + asset_hash.hexdigest()[:12], is_demo=False,
            license=dict(type='CC BY 4.0 · 原画整理与双语翻译版', source_url=story['source_url'],
                license_url=story['license_url'], attribution=attribution, review_status='pending',
                commercial_use=True, self_hosting=True, translation_allowed=True, audio_derivative_allowed=True),
            pages=pages, voices={})
        for language, text_key, audio_key in [('zh', 'text_zh', 'audio_zh'), ('en', 'text_original', 'audio_original')]:
            if len(old.get('pages', [])) == len(pages) and all(a[text_key] == b.get(text_key) for a, b in zip(pages, old['pages'])):
                for page, previous in zip(pages, old['pages']):
                    if previous.get(audio_key):
                        page[audio_key] = previous[audio_key]
                if old.get('voices', {}).get(language):
                    book['voices'][language] = old['voices'][language]
        for page, previous in zip(pages, old.get('pages', [])):
            if (page['text_zh'], page['text_original'], page['image']) == (previous.get('text_zh'), previous.get('text_original'), previous.get('image')) and previous.get('dialogue'):
                page['dialogue'] = previous['dialogue']
        manifest.write_text(json.dumps(book, ensure_ascii=False, indent=2) + '\n')
        print(f'{book_id}: {len(pages)} 页原画与双语资料已准备，未上传、未入库。')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path)
    parser.add_argument('--art-only', action='store_true', help='只处理图片，不修改 JSON 或配音引用')
    parser.add_argument('--book', action='append', help='仅处理指定书 ID，可重复；默认查MySQL，不再重建书目JSON')
    parser.add_argument('--db-config', type=Path, help='数据库.env配置文件')
    parser.add_argument('--legacy-json', action='store_true', help='显式启用旧版JSON重建，仅兼容历史资料')
    args = parser.parse_args()
    if not args.art_only and not args.legacy_json:
        if not args.book:
            parser.error('请用 --book 指定数据库书目；不再默认重生成旧书JSON')
        import importlib.util
        spec = importlib.util.spec_from_file_location('pic_db_materials', Path(__file__).with_name('materials.py'))
        materials = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(materials)
        for book_id in args.book:
            materials.make_art(materials.Store(args.db_config), book_id, args.source_dir)
    else:
        prepare(args.source_dir or ROOT/'docs/materials-review/original-sources-20261110', args.art_only, args.book)
