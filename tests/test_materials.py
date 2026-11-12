"""Check the actual replacement batch, source alignment, retirement and scene semantics."""
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import unittest
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('material_art', ROOT/'scripts/illustrate_books.py')
art = importlib.util.module_from_spec(spec)
spec.loader.exec_module(art)


class MaterialTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sources = json.loads((ROOT/'content/sources/bookdash/sources.json').read_text())
        cls.original_sources = json.loads((ROOT/'content/sources/bookdash-originals/sources.json').read_text())
        cls.books = {b['id']: b for b in json.loads((ROOT/'tests/fixtures/library.json').read_text())['books']}
        cls.boards = json.loads((ROOT/'config/illustrations.json').read_text())

    def test_complete_sources_match_every_english_spread_and_explicit_additions(self):
        for bid, source in self.sources.items():
            with self.subTest(book=bid):
                raw = (ROOT/'content/sources/bookdash'/source['source_file']).read_text()
                self.assertEqual(hashlib.sha256(raw.encode()).hexdigest(), source['sha256'])
                chunks = re.split(r'!\[[^\]]*\]\(\{\{ site.image-set \}\}/\d+\.jpg\)', raw)[1:]
                texts = [' '.join(c.strip().split()) for c in chunks]
                additions = source['narration_additions']
                for number, added in additions.items():
                    self.assertEqual(texts[int(number)-1], '', 'only wordless spreads get added narration')
                    texts[int(number)-1] = added
                book = self.books[bid]
                self.assertEqual(texts, [p['text_original'] for p in book['pages']])
                self.assertEqual(len(texts), source['story_spreads'])
                self.assertTrue(all(p['text_zh'].strip() for p in book['pages']))
                self.assertIn(source['creators']['Writer'], book['license']['attribution'])
                self.assertIn(source['creators']['Illustrator'], book['license']['attribution'])
                self.assertEqual(book['license']['license_url'], source['license_url'])
                self.assertFalse(book['is_demo'])

    def test_replacement_contains_only_new_books_and_legacy_files_are_absent(self):
        published = [b for b in self.books.values() if b['publish_status'] == 'published']
        expected = set(self.sources) | set(self.original_sources)
        self.assertEqual({b['id'] for b in published}, expected)
        self.assertEqual(len(published), len(expected))
        self.assertEqual(sum(b['page_count'] for b in published), sum(s['story_spreads'] for s in self.sources.values()) + sum(len(s['images']) - 1 for s in self.original_sources.values()))
        self.assertEqual({age for b in published for age in b['age_ranges']}, {'0-2', '3-4', '5-6'})
        self.assertEqual(set(self.books), expected)
        for p in (ROOT/'tests/fixtures/books').glob('*.json'):
            legacy_id = json.loads(p.read_text())['id']
            self.assertFalse((ROOT/'content/books'/f'{legacy_id}.json').exists())
            self.assertFalse((ROOT/'web/assets/books'/legacy_id).exists())
        self.assertFalse(list((ROOT/'web/assets/audio-previews').glob('*.mp3')))

    def test_new_stories_never_reference_old_story_audio(self):
        for bid in self.books:
            for page in self.books[bid]['pages']:
                for key in ('audio_zh', 'audio_original'):
                    if page.get(key):
                        self.assertTrue(page[key].startswith('/assets/books/'+bid+'/audio/'))

    def test_original_editions_preserve_reviewed_text_page_order_and_credits(self):
        for bid, evidence in self.original_sources.items():
            with self.subTest(book=bid):
                source = json.loads((ROOT/'content/sources/bookdash-originals'/(bid.removeprefix('bd-')+'.json')).read_text())
                book = self.books[bid]
                self.assertEqual(book['page_count'], 12)
                self.assertEqual([p['page_number'] for p in source['pages']], list(range(1, 13)))
                # New source snapshots preserve original English only. Chinese,
                # alt text and dialogue are edited only in MySQL.
                keys = ['text_original']
                if 'text_zh' in source['pages'][0]:
                    keys.extend(['text_zh', 'image_alt'])
                for key in keys:
                    self.assertEqual([p[key] for p in book['pages']], [p[key] for p in source['pages']])
                self.assertEqual(book['illustrator'], source['illustrator'])
                for key in ('writer', 'illustrator', 'designer', 'editor'):
                    self.assertIn(source[key], book['license']['attribution'])
                self.assertEqual(book['license']['source_url'], evidence['source_url'])
                self.assertEqual(book['license']['license_url'], evidence['license_url'])
                self.assertEqual([p['page_number'] for p in evidence['images']], list(range(13)))
                self.assertEqual(len({p['sha256'] for p in evidence['images']}), 13)
                self.assertTrue(set(source['narration_additions']).issubset(range(1, 13)))

    def objects(self, bid, number):
        root = ET.fromstring(art.page_svg(self.books[bid], number, self.boards[bid]))
        return [e.get('data-object') for e in root.iter() if e.get('data-object')]

    def test_story_turns_are_visible_in_new_artwork(self):
        cases = {
            'bd-come-back-cat': {3: ['curtain'], 6: ['sock-and-clothesline'], 7: ['snail'], 11: ['empty-basket'], 12: ['sofa']},
            'bd-a-house-for-mouse': {4: ['dream-frame'], 7: ['fish-tank'], 8: ['waterweed'], 10: ['enclosed-fireplace'], 12: ['bookshelf']},
            'bd-amazing-daisy': {5: ['imagined-flight'], 9: ['soft-straw'], 10: ['round-house', 'lifting-wind']},
            'bd-a-tiny-seed': {2: ['seeds-and-laid-down-machete'], 6: ['magnifier'], 8: ['tree-stumps'], 9: ['seedlings'], 11: ['peace-prize-medal']},
            'bd-sleepy-mr-sloth': {4: ['giraffe-horns-and-muzzle'], 6: ['beehive', 'bee'], 8: ['snake'], 10: ['loud-bird-call']},
            'bd-little-ants-big-plan': {6: ['restaurant-plan'], 8: ['restaurant'], 10: ['ant-queen', 'food-burger', 'ant-handshake'], 11: ['family-hug'], 12: ['open-book']},
            'bd-tortoise-finds-his-home': {2: ['tortoise-shell', 'snail'], 9: ['distant-lightning'], 11: ['closed-tortoise-shell'], 12: ['friends-sheltering']},
            'bd-whose-button-is-this': {5: ['green-signal'], 6: ['red-signal'], 9: ['pedestrian-crossing'], 10: ['passing-car'], 12: ['missing-button-eye']},
            'bd-hippo-wants-to-dance': {2: ['millipede'], 6: ['meerkat-bath'], 8: ['water-buckets'], 10: ['grasshopper']},
            'bd-what-is-it': {2: ['elephant-trunk'], 5: ['buck-antlers'], 8: ['sneeze-puffs'], 12: ['human-baby', 'buck']},
        }
        for bid, pages in cases.items():
            for number, expected in pages.items():
                with self.subTest(book=bid, page=number):
                    objects = self.objects(bid, number)
                    for name in expected:
                        self.assertIn(name, objects)
        self.assertNotIn('missing-button-eye', self.objects('bd-whose-button-is-this', 13))
        self.assertNotIn('tortoise-head', self.objects('bd-tortoise-finds-his-home', 11))
        for number in range(2, 11):
            self.assertEqual(self.objects('bd-tortoise-finds-his-home', number).count('snail'), 1)


if __name__ == '__main__':
    unittest.main()
