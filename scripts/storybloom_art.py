"""Prepare verified StoryBloom originals without resizing or re-encoding them."""
import hashlib
import json
from pathlib import Path
import shutil

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def prepare(book, source_dir=None):
    evidence = json.loads((ROOT/'content/sources/storybloom/sources.json').read_text())[book['id']]
    folder = Path(source_dir) if source_dir else ROOT/evidence['originals_directory']
    originals = []
    if [p['page_number'] for p in book['pages']] != [p['page_number'] for p in evidence['images']]:
        raise ValueError('数据库页序与已核验原图不一致：' + book['id'])
    # Verify the complete source set before touching any production file.
    for entry in evidence['images']:
        path = folder/entry['file']
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != entry['sha256']:
            raise ValueError('原图校验失败：' + str(path))
        with Image.open(path) as picture:
            picture.load()
            if picture.format != 'WEBP' or list(picture.size) != entry['dimensions']:
                raise ValueError('原图格式或尺寸不符：' + str(path))
        originals.append(path)
    output = ROOT/'web/assets/books'/book['id']
    output.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(originals[0], output/'cover.webp')
    book['cover'] = f"/assets/books/{book['id']}/cover.webp"
    digest = hashlib.sha256(originals[0].read_bytes())
    for page, original in zip(book['pages'], originals):
        name = f"page-{page['page_number']:03}.webp"
        shutil.copyfile(original, output/name)
        page['image'] = f"/assets/books/{book['id']}/{name}"
        digest.update(original.read_bytes())
        digest.update(page['image_alt'].encode())
    book['content_version'] = 'storybloom-original-v1-' + digest.hexdigest()[:12]
    return book
