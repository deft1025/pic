import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('illustrate_books', ROOT/'scripts/illustrate_books.py')
art = importlib.util.module_from_spec(spec)
spec.loader.exec_module(art)


def objects(root):
    return [el.get('data-object') for el in root.iter() if el.get('data-object')]


class IllustrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.boards = json.loads((ROOT/'tests/fixtures/illustrations.json').read_text())
        cls.boards.update(json.loads((ROOT/'config/illustrations.json').read_text()))
        cls.books = {bid: json.loads(((ROOT/'tests/fixtures/books' if (ROOT/'tests/fixtures/books'/f'{bid}.json').is_file() else ROOT/'content/books')/f'{bid}.json').read_text()) for bid in cls.boards}

    def page(self, bid, number):
        return ET.fromstring(art.page_svg(self.books[bid], number, self.boards[bid]))

    def test_every_page_and_cover_parse_and_all_page_drawings_are_distinct(self):
        hashes = set()
        for bid, book in self.books.items():
            ET.fromstring(art.cover_svg(book, self.boards[bid]))
            for n in range(1, book['page_count'] + 1):
                root = self.page(bid, n)
                self.assertEqual(root.get('viewBox'), '0 0 1200 800')
                # Exclude page labels and scene IDs: uniqueness must come from drawing elements.
                drawing = b''.join(ET.tostring(child) for child in root if child.tag.rsplit('}', 1)[-1] not in ['title', 'desc'])
                digest = hashlib.sha256(drawing).hexdigest()
                self.assertNotIn(digest, hashes, f'{bid} page {n} repeats another illustration')
                hashes.add(digest)
        self.assertEqual(len(hashes), sum(b['page_count'] for b in self.books.values()))

    def test_goodnight_and_sharing_show_their_actual_story_objects(self):
        for n, required in {1: ['window', 'pillow'], 2: ['bird-nest'], 3: ['bed', 'bear-face'], 4: ['moon'], 5: ['bed'], 6: ['bed']}.items():
            for obj in required:
                self.assertIn(obj, objects(self.page('moon-rabbit', n)))
        self.assertNotIn('bird-nest', objects(self.page('moon-rabbit', 1)))
        self.assertIn('bread', objects(self.page('bear-share', 1)))
        self.assertIn('bread-slice', objects(self.page('bear-share', 2)))
        self.assertIn('plate', objects(self.page('bear-share', 4)))
        self.assertNotIn('bread', objects(self.page('bear-share', 4)))
        self.assertNotIn('bread-slice', objects(self.page('bear-share', 4)))
        for obj in ['carrots', 'blueberries', 'bear', 'rabbit', 'fox']:
            self.assertIn(obj, objects(self.page('bear-share', 6)))

    def test_seed_does_not_show_a_flower_before_growing(self):
        for n in range(1, 6):
            self.assertNotIn('flower', objects(self.page('seed-journey', n)))
        self.assertIn('snow', objects(self.page('seed-journey', 2)))
        self.assertNotIn('root', objects(self.page('seed-journey', 2)))
        self.assertIn('rain', objects(self.page('seed-journey', 3)))
        for obj in ['root', 'shoot']:
            self.assertIn(obj, objects(self.page('seed-journey', 4)))
        self.assertIn('ladybug', objects(self.page('seed-journey', 5)))
        self.assertIn('flower', objects(self.page('seed-journey', 6)))

    def test_visible_star_counts_match_the_counting_text(self):
        for page, count in [(1, 0), (2, 1), (3, 2), (4, 3), (5, 5), (6, 17)]:
            self.assertEqual(objects(self.page('count-stars', page)).count('star'), count)

    def test_brushing_bridge_emotion_and_rain_scenes_have_their_landmarks(self):
        self.assertIn('sink', objects(self.page('teddy-brush', 1)))
        self.assertIn('toothpaste', objects(self.page('teddy-brush', 2)))
        self.assertIn('teeth', objects(self.page('teddy-brush', 3)))
        self.assertIn('outside-teeth', objects(self.page('teddy-brush', 3)))
        self.assertIn('inside-teeth', objects(self.page('teddy-brush', 3)))
        self.assertIn('top-and-bottom-brushing', objects(self.page('teddy-brush', 4)))
        self.assertIn('running-water', objects(self.page('teddy-brush', 5)))
        self.assertEqual(objects(self.page('teddy-brush', 5)).count('toothbrush'), 1)
        self.assertIn('mirror-reflection', objects(self.page('teddy-brush', 6)))
        for n in range(1, 7):
            self.assertIn('wooden-bridge', objects(self.page('hedgehog-brave', n)))
        angry = [el for el in self.page('fox-feelings', 2).iter() if el.get('data-expression') == 'angry']
        self.assertEqual(len(angry), 1)
        self.assertIn('fallen-blocks', objects(self.page('fox-feelings', 2)))
        self.assertIn('slow-breath', objects(self.page('fox-feelings', 3)))
        self.assertIn('leaf-umbrella', objects(self.page('rainy-friends', 1)))
        self.assertNotIn('rain', objects(self.page('rainy-friends', 6)))
        self.assertIn('rainbow', objects(self.page('rainbow-walk', 6)))
        self.assertIn('stone-crack', objects(self.page('moon-letter', 4)))

    def test_regeneration_preserves_audio_text_and_operational_data_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory, patch('builtins.print'):
            root = Path(directory)
            config = root/'boards.json'
            config.write_text(json.dumps(self.boards))
            content = root/'books'
            content.mkdir()
            for bid, book in self.books.items():
                (content/f'{bid}.json').write_text(json.dumps(book))
            art.generate(content, root/'web', config)
            for bid, old in self.books.items():
                updated = json.loads((content/f'{bid}.json').read_text())
                self.assertEqual(updated.get('voices'), old.get('voices'))
                self.assertEqual(updated['license'], old['license'])
                self.assertEqual(updated['publish_status'], old['publish_status'])
                for a, b in zip(old['pages'], updated['pages']):
                    for key in ['text_zh', 'text_original', 'audio_zh', 'audio_original']:
                        self.assertEqual(a.get(key), b.get(key))
                self.assertRegex(updated['content_version'], '-'+art.ART_VERSION+r'-[0-9a-f]{12}$')
            before = {p.name: p.read_bytes() for p in content.glob('*.json')}
            art.generate(content, root/'web', config)
            self.assertEqual(before, {p.name: p.read_bytes() for p in content.glob('*.json')})

    def test_changed_story_text_requires_new_storyboard_before_any_images_are_overwritten(self):
        with tempfile.TemporaryDirectory() as directory, patch('builtins.print'):
            root = Path(directory)
            config = root/'boards.json'
            config.write_text(json.dumps(self.boards))
            for bid, book in self.books.items():
                changed = copy.deepcopy(book)
                if bid == 'moon-letter':
                    changed['pages'][0]['text_zh'] += '新情节。'
                (root/f'{bid}.json').write_text(json.dumps(changed))
            with self.assertRaisesRegex(ValueError, '请先调整分镜'):
                art.generate(root, root/'web', config)
            self.assertFalse((root/'web').exists())


if __name__ == '__main__':
    unittest.main()
