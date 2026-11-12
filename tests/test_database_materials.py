import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location('db_test_' + name, ROOT/'scripts'/f'{name}.py')
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


materials = load('materials')


class MemoryDatabase:
    def __init__(self, book, conflict=False):
        self.book = copy.deepcopy(book)
        self.revision = 'first'
        self.saved = 0
        self.conflict = conflict

    def read(self, book_id):
        assert book_id == self.book['id']
        return {'book': copy.deepcopy(self.book), 'revision': self.revision}

    def save(self, snapshot):
        if self.conflict or snapshot['revision'] != self.revision:
            raise RuntimeError('绘本已被其他操作修改')
        self.book = copy.deepcopy(snapshot['book'])
        self.saved += 1
        self.revision = str(self.saved)


class DatabaseMaterialTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        self.book = json.loads((ROOT/'tests/fixtures/books/moon-rabbit.json').read_text())
        self.book.pop('voices', None)
        for p in self.book['pages']:
            p.pop('audio_zh', None)
            p.pop('audio_original', None)
        self.audio = load('generate_audio')
        self.package = load('package_assets')
        self.art = load('illustrate_books')
        self.calls = []
        for patcher in [patch.object(materials, 'module', side_effect=lambda name: {'generate_audio': self.audio, 'package_assets': self.package, 'illustrate_books': self.art}[name]),
                        patch.object(self.audio, 'ROOT', self.root), patch('builtins.print')]:
            patcher.start()
            self.addCleanup(patcher.stop)

    def synthesize(self, command, **kwargs):
        self.calls.append(command)
        Path(command[command.index('--write-media') + 1]).write_bytes(b'fake-mp3' * 50)

    def test_bilingual_audio_reads_database_and_commits_each_complete_language(self):
        store = MemoryDatabase(self.book)
        with patch.object(self.audio.shutil, 'which', return_value='/test/edge-tts'), patch.object(self.audio.subprocess, 'run', side_effect=self.synthesize):
            materials.make_audio(store, self.book['id'])
        self.assertEqual(len(self.calls), 12)
        self.assertEqual(store.saved, 2)
        self.assertEqual(set(store.book['voices']), {'zh', 'en'})
        self.assertTrue(all(p.get('audio_zh') and p.get('audio_original') for p in store.book['pages']))
        self.assertFalse((self.root/'content').exists(), 'must not create a maintained JSON directory')
        # Uploaded audio can be absent locally without triggering regeneration.
        import shutil
        shutil.rmtree(self.root/'web/assets/books')
        with patch.object(self.audio.subprocess, 'run') as run:
            materials.make_audio(store, self.book['id'])
            run.assert_not_called()
        self.assertEqual(store.saved, 2)

    def test_failed_generation_and_concurrent_edits_leave_database_unchanged(self):
        for failure in ['generation', 'revision']:
            store = MemoryDatabase(self.book, conflict=failure == 'revision')
            def generate(command, **kwargs):
                if failure == 'generation':
                    raise subprocess.CalledProcessError(1, command)
                return self.synthesize(command, **kwargs)
            with patch.object(self.audio.shutil, 'which', return_value='/test/edge-tts'), patch.object(self.audio.subprocess, 'run', side_effect=generate):
                with self.assertRaises((RuntimeError, subprocess.CalledProcessError)):
                    materials.make_audio(store, self.book['id'], 'zh', force=True)
            self.assertEqual(store.book, self.book)
            self.assertEqual(store.saved, 0)

    def test_preview_does_not_write_database(self):
        store = MemoryDatabase(self.book)
        with patch.object(self.audio.shutil, 'which', return_value='/test/edge-tts'), patch.object(self.audio.subprocess, 'run', side_effect=self.synthesize):
            materials.make_audio(store, self.book['id'], 'en', preview=True)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(store.saved, 0)

    def test_package_uses_database_paths_without_any_book_json(self):
        book = copy.deepcopy(self.book)
        bid = book['id']
        book['cover'] = f'/assets/books/{bid}/cover.svg'
        for p in book['pages']:
            p['image'] = f"/assets/books/{bid}/page-{p['page_number']}.svg"
            p['audio_zh'] = f"/assets/books/{bid}/zh-{p['page_number']}.mp3"
            p['audio_original'] = f"/assets/books/{bid}/en-{p['page_number']}.mp3"
        refs = [book['cover'], *[p[k] for p in book['pages'] for k in ['image', 'audio_zh', 'audio_original']]]
        for ref in refs:
            dest = self.root/'web'/ref.lstrip('/')
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(b'actual-file')
        store = MemoryDatabase(book)
        output, stats = materials.package(store, bid, root=self.root)
        self.assertEqual(stats['files'], 19)
        with tarfile.open(output) as tar:
            self.assertEqual(len(tar.getnames()), 19)
            for member in tar:
                self.assertTrue(member.name.startswith(bid + '/'))
                self.assertEqual(tar.extractfile(member).read(), b'actual-file')
        self.assertEqual(store.saved, 0)
        self.assertFalse((self.root/'content').exists())

    def test_art_reads_one_database_book_and_preserves_text_dialogue_and_audio(self):
        books = json.loads((ROOT/'tests/fixtures/library.json').read_text())['books']
        book = next(b for b in books if b['id'] == 'bd-come-back-cat')
        boards = json.loads((ROOT/'config/illustrations.json').read_text())
        (self.root/'config').mkdir()
        (self.root/'config/illustrations.json').write_text(json.dumps({book['id']: boards[book['id']]}))
        source = self.root/'content/sources/bookdash-originals/sources.json'
        source.parent.mkdir(parents=True)
        source.write_text('{}')
        store = MemoryDatabase(book)
        with patch.object(materials, 'ROOT', self.root):
            materials.make_art(store, book['id'])
        self.assertEqual(store.saved, 1)
        self.assertEqual(store.book['voices'], book['voices'])
        self.assertEqual(store.book['license'], book['license'])
        for a, b in zip(store.book['pages'], book['pages']):
            for key in ['text_zh', 'text_original', 'audio_zh', 'audio_original', 'dialogue']:
                self.assertEqual(a.get(key), b.get(key))
        self.assertEqual(len(list((self.root/'web/assets/books'/book['id']).glob('*.svg'))), 13)
        self.assertFalse((self.root/'content/books').exists())


if __name__ == '__main__':
    unittest.main()
