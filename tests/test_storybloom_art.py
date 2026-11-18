"""Check source integrity and preservation before publishing original artwork."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

spec = importlib.util.spec_from_file_location('storybloom_art', Path(__file__).resolve().parents[1]/'scripts/storybloom_art.py')
art = importlib.util.module_from_spec(spec)
spec.loader.exec_module(art)


class StorybloomArtTests(unittest.TestCase):
    def test_verified_bytes_preserve_content_and_bad_source_cannot_overwrite_art(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root/'originals'
            source.mkdir()
            entries = []
            for n, color in [(1, 'blue'), (2, 'yellow')]:
                path = source/f'{n}.webp'
                Image.new('RGB', (32, 32), color).save(path, 'WEBP')
                entries.append({'page_number': n, 'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'dimensions': [32, 32]})
            evidence = root/'content/sources/storybloom/sources.json'
            evidence.parent.mkdir(parents=True)
            evidence.write_text(json.dumps({'test-book': {'originals_directory': 'originals', 'images': entries}}))
            book = {'id': 'test-book', 'license': {'review_status': 'pending'}, 'pages': [{'page_number': n, 'image_alt': 'actual scene', 'text_zh': '保留正文', 'audio_zh': '/audio.mp3', 'dialogue': {'parts': []}} for n in [1, 2]]}
            before = copy.deepcopy(book)
            with patch.object(art, 'ROOT', root):
                result = art.prepare(book)
                for n, page in enumerate(result['pages'], 1):
                    self.assertEqual((root/'web'/page['image'].lstrip('/')).read_bytes(), (source/f'{n}.webp').read_bytes())
                    for key in ['text_zh', 'audio_zh', 'dialogue', 'image_alt']:
                        self.assertEqual(page[key], before['pages'][n-1][key])
                self.assertEqual(result['license'], before['license'])
                cover = root/'web'/result['cover'].lstrip('/')
                saved = cover.read_bytes()
                # Even a valid replacement WebP is rejected when not reviewed.
                Image.new('RGB', (32, 32), 'red').save(source/'2.webp', 'WEBP')
                with self.assertRaisesRegex(ValueError, '原图校验失败'):
                    art.prepare(book)
                self.assertEqual(cover.read_bytes(), saved)


if __name__ == '__main__':
    unittest.main()
