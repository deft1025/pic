import importlib.util
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('package_assets', ROOT/'scripts/package_assets.py')
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


class PackageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root/'content/books').mkdir(parents=True)
        for bid in ('first', 'second'):
            book = json.loads((ROOT/'tests/fixtures/books/moon-rabbit.json').read_text())
            book['id'] = bid
            book['cover'] = f'/assets/books/{bid}/cover.svg'
            book['voices'] = {}
            for page in book['pages']:
                page['image'] = f'/assets/books/{bid}/page-{page["page_number"]}.svg'
                page['audio_zh'] = f'/assets/books/{bid}/audio/zh/{page["page_number"]}.mp3'
                page['audio_original'] = f'/assets/books/{bid}/audio/en/{page["page_number"]}.mp3'
            (self.root/'content/books'/f'{bid}.json').write_text(json.dumps(book))
            for value in [book['cover'], *[page[key] for page in book['pages'] for key in ('image', 'audio_zh', 'audio_original')]]:
                p = self.root/'web'/value.lstrip('/')
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_bytes(('content:' + value).encode())
        (self.root/'web/assets/hero.svg').write_bytes(b'hero')
        for name in ('.DS_Store', '._.DS_Store', '._page-1.svg', 'old.tar.gz', 'unused.mp3'):
            (self.root/'web/assets/books/first'/name).write_bytes(b'auxiliary-or-unused')

    def test_full_package_restores_assets_and_excludes_auxiliary_or_unused_files(self):
        output, stats = package.package_assets(self.root)
        self.assertEqual(output, self.root/'pic-book-assets.tar.gz')
        self.assertEqual(stats, {'books': 2, 'pages': 12, 'files': 39})
        with tarfile.open(output) as archive:
            names = archive.getnames()
            self.assertEqual(len(names), 39)
            self.assertIn('assets/hero.svg', names)
            for member in archive:
                self.assertTrue(member.isfile())
                original = self.root/'web'/member.name
                self.assertEqual(archive.extractfile(member).read(), original.read_bytes())
                self.assertFalse(member.pax_headers)
            self.assertFalse(any('DS_Store' in name or '._' in name or name.endswith('.tar.gz') or 'unused' in name for name in names))

    def test_single_book_package_extracts_under_books_without_extra_assets_level(self):
        output, stats = package.package_assets(self.root, 'first')
        self.assertEqual(output, self.root/'web/assets/books/first.tar.gz')
        self.assertEqual(stats['books'], 1)
        with tarfile.open(output) as archive:
            for name in archive.getnames():
                self.assertTrue(name.startswith('first/'))
                self.assertEqual(archive.extractfile(name).read(), (self.root/'web/assets/books'/name).read_bytes())
        full, _ = package.package_assets(self.root)
        with tarfile.open(full) as archive:
            self.assertFalse(any(name.endswith('.tar.gz') for name in archive.getnames()))

    def test_missing_asset_does_not_replace_existing_package(self):
        output = self.root/'pic-book-assets.tar.gz'
        output.write_bytes(b'existing-package')
        (self.root/'web/assets/books/first/audio/en/1.mp3').unlink()
        with self.assertRaises(ValueError):
            package.package_assets(self.root)
        self.assertEqual(output.read_bytes(), b'existing-package')
        self.assertFalse(list(self.root.glob('*.tmp')))

    def test_single_book_rejects_path_traversal_and_cross_book_resources(self):
        for bid in ('../first', '/tmp/first', 'first/name'):
            with self.assertRaises(ValueError):
                package.package_assets(self.root, bid)
        path = self.root/'content/books/first.json'
        book = json.loads(path.read_text())
        book['cover'] = '/assets/books/second/cover.svg'
        path.write_text(json.dumps(book))
        with self.assertRaisesRegex(ValueError, '单书包的资源'):
            package.package_assets(self.root, 'first')


if __name__ == '__main__':
    unittest.main()
