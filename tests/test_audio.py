import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('generate_audio', ROOT / 'scripts/generate_audio.py')
audio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audio)


class AudioTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.book = self.root / 'book.json'
        self.original = (ROOT / 'tests/fixtures/books/moon-rabbit.json').read_bytes()
        self.book.write_bytes(self.original)
        self.calls = []
        self.print_patch = patch('builtins.print')
        self.print_patch.start()
        self.addCleanup(self.print_patch.stop)
        self.root_patch = patch.object(audio, 'ROOT', self.root)
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)

    def synthesize(self, command, **kwargs):
        self.calls.append(command)
        dest = Path(command[command.index('--write-media') + 1])
        dest.write_bytes(b'fake-mp3' * 50)

    def test_preview_does_not_change_book_or_make_full_book_audio(self):
        with patch.object(audio.shutil, 'which', return_value='/test/edge-tts'), patch.object(audio.subprocess, 'run', side_effect=self.synthesize):
            audio.main([str(self.book), '--preview'])
        self.assertEqual(self.book.read_bytes(), self.original)
        self.assertEqual(len(self.calls), 1)
        self.assertIn('--rate=-20%', self.calls[0])
        self.assertIn('zh-CN-XiaoxiaoNeural', self.calls[0])
        self.assertTrue((self.root / 'web/assets/audio-previews/moon-rabbit-zh-preview.mp3').is_file())
        self.assertFalse((self.root / 'web/assets/books').exists())

    def test_preview_uses_active_python_module_when_command_is_missing(self):
        with patch.object(audio.shutil, 'which', return_value=None), patch.object(audio.importlib.util, 'find_spec', return_value=object()), patch.object(audio.subprocess, 'run', side_effect=self.synthesize):
            audio.main([str(self.book), '--preview', '--language', 'en', '--rate=-30%', '--voice', 'en-US-JennyNeural'])
        self.assertEqual(self.calls[0][:3], [audio.sys.executable, '-m', 'edge_tts'])
        self.assertIn('--rate=-30%', self.calls[0])
        self.assertIn(json.loads(self.original)['pages'][0]['text_original'], self.calls[0])

    def test_failed_preview_keeps_old_preview_and_cleans_temp_file(self):
        dest = self.root / 'web/assets/audio-previews/moon-rabbit-zh-preview.mp3'
        dest.parent.mkdir(parents=True)
        dest.write_bytes(b'existing-preview')
        with patch.object(audio.shutil, 'which', return_value='/test/edge-tts'), patch.object(audio.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, 'edge-tts')):
            with self.assertRaises(subprocess.CalledProcessError):
                audio.main([str(self.book), '--preview'])
        self.assertEqual(dest.read_bytes(), b'existing-preview')
        self.assertEqual(list(dest.parent.iterdir()), [dest])
        self.assertEqual(self.book.read_bytes(), self.original)

    def test_empty_output_is_not_published(self):
        with patch.object(audio.shutil, 'which', return_value='/test/edge-tts'), patch.object(audio.subprocess, 'run'):
            with self.assertRaisesRegex(RuntimeError, '音频生成为空'):
                audio.main([str(self.book), '--preview'])
        self.assertFalse(list((self.root / 'web/assets/audio-previews').iterdir()))

    def test_rate_validation_precedes_generation(self):
        for rate in ['-100%', '0', 'fast', '+51%']:
            with self.subTest(rate=rate), patch.object(audio.subprocess, 'run') as run, patch('sys.stderr'):
                with self.assertRaises(SystemExit):
                    audio.main([str(self.book), '--rate=' + rate])
                run.assert_not_called()

    def test_full_generation_only_saves_manifest_after_all_pages_succeed(self):
        def second_page_fails(command, **kwargs):
            if self.calls:
                raise subprocess.CalledProcessError(1, 'edge-tts')
            self.synthesize(command, **kwargs)
        with patch.object(audio.shutil, 'which', return_value='/test/edge-tts'), patch.object(audio.subprocess, 'run', side_effect=second_page_fails):
            with self.assertRaises(subprocess.CalledProcessError):
                audio.main([str(self.book)])
        self.assertEqual(self.book.read_bytes(), self.original)
        self.assertFalse(list((self.root / 'web/assets/books/moon-rabbit/audio/zh').rglob('tmp*')))

    def test_settings_file_and_command_overrides_are_used(self):
        config = self.root / 'audio.json'
        config.write_text(json.dumps({'zh': {'voice': 'zh-CN-XiaoyiNeural', 'rate': '-30%'}}))
        with patch.object(audio.shutil, 'which', return_value='/test/edge-tts'), patch.object(audio.subprocess, 'run', side_effect=self.synthesize):
            audio.main([str(self.book), '--preview', '--config', str(config)])
            self.assertIn('zh-CN-XiaoyiNeural', self.calls[-1])
            self.assertIn('--rate=-30%', self.calls[-1])
            audio.main([str(self.book), '--preview', '--config', str(config), '--voice', 'zh-CN-XiaoxiaoNeural', '--rate=-20%'])
            self.assertIn('zh-CN-XiaoxiaoNeural', self.calls[-1])
            self.assertIn('--rate=-20%', self.calls[-1])

    def test_changed_settings_or_text_generate_new_paths_and_preserve_old_audio(self):
        with patch.object(audio.shutil, 'which', return_value='/test/edge-tts'), patch.object(audio.subprocess, 'run', side_effect=self.synthesize):
            audio.main([str(self.book)])
            original = json.loads(self.book.read_text())
            first_path = original['pages'][0]['audio_zh']
            self.assertEqual(original['voices']['zh']['voice_id'], 'zh-CN-XiaoxiaoNeural')
            self.assertEqual(len(self.calls), 6)
            audio.main([str(self.book)])
            self.assertEqual(len(self.calls), 6, 'identical sources should reuse complete audio')
            audio.main([str(self.book), '--rate=-30%'])
            slower = json.loads(self.book.read_text())
            self.assertNotEqual(slower['pages'][0]['audio_zh'], first_path)
            self.assertEqual(len(self.calls), 12)
            self.assertTrue((self.root / 'web' / first_path.lstrip('/')).exists())
            slower['pages'][0]['text_zh'] += '新的文本。'
            self.book.write_text(json.dumps(slower))
            audio.main([str(self.book), '--rate=-30%'])
            changed = json.loads(self.book.read_text())
            self.assertNotEqual(changed['pages'][0]['audio_zh'], slower['pages'][0]['audio_zh'])

    def test_directory_generation_applies_the_same_standard_to_every_book(self):
        second = json.loads(self.original)
        second['id'] = 'second-book'
        other = self.root / 'second.json'
        other.write_text(json.dumps(second))
        with patch.object(audio.shutil, 'which', return_value='/test/edge-tts'), patch.object(audio.subprocess, 'run', side_effect=self.synthesize):
            audio.main([str(self.root)])
        self.assertEqual(len(self.calls), 12)
        for command in self.calls:
            self.assertIn('zh-CN-XiaoxiaoNeural', command)
            self.assertIn('--rate=-20%', command)
        for path in [self.book, other]:
            updated = json.loads(path.read_text())
            self.assertTrue(all(page.get('audio_zh') for page in updated['pages']))

    def test_invalid_book_in_batch_prevents_any_generation(self):
        second = json.loads(self.original)
        second['pages'][0]['text_zh'] = ''
        (self.root / 'second.json').write_text(json.dumps(second))
        with patch.object(audio.shutil, 'which', return_value='/test/edge-tts'), patch.object(audio.subprocess, 'run') as run, patch('sys.stderr'):
            with self.assertRaises(SystemExit):
                audio.main([str(self.root)])
            run.assert_not_called()
        self.assertEqual(self.book.read_bytes(), self.original)

    def test_directory_skips_retired_books_but_explicit_file_can_regenerate_them(self):
        retired = json.loads(self.original)
        retired['id'] = 'retired-book'
        retired['publish_status'] = 'offline'
        retired_path = self.root / 'retired.json'
        retired_path.write_text(json.dumps(retired))
        before = retired_path.read_bytes()
        with patch.object(audio.shutil, 'which', return_value='/test/edge-tts'), patch.object(audio.subprocess, 'run', side_effect=self.synthesize):
            audio.main([str(self.root)])
            self.assertEqual(retired_path.read_bytes(), before)
            self.assertEqual(len(self.calls), 6)
            self.assertFalse((self.root / 'web/assets/books/retired-book').exists())
            audio.main([str(retired_path)])
            self.assertEqual(len(self.calls), 12)


if __name__ == '__main__':
    unittest.main()
