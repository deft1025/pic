import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('import_books',ROOT/'scripts/import_books.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class ImportTests(unittest.TestCase):
 def setUp(self):
  self.book=json.loads((ROOT/'tests/fixtures/books/moon-rabbit.json').read_text())
 def test_pending_published_by_default(self):
  module.validate(self.book,ROOT/'tests/fixtures/web')
  with self.assertRaises(ValueError):module.validate(self.book,ROOT/'tests/fixtures/web',True)
 def test_missing_audio_is_rejected(self):
  self.book['pages'][0]['audio_zh']='/assets/missing.mp3'
  with self.assertRaises(ValueError):module.validate(self.book,ROOT/'tests/fixtures/web')
 def test_wrong_page_order_is_rejected(self):
  self.book['pages'][1]['page_number']=99
  with self.assertRaises(ValueError):module.validate(self.book,ROOT/'tests/fixtures/web')
 def test_unsafe_path_is_rejected(self):
  for path in ['/assets/../../etc/passwd','https://example.com/cover.png','/assets/%2e%2e/test.svg']:
   b=copy.deepcopy(self.book);b['cover']=path
   with self.assertRaises(ValueError):module.validate(b,ROOT/'tests/fixtures/web')
 def test_partial_voice_metadata_is_rejected(self):
  self.book['voices']={'zh':{'provider':'test'}}
  with self.assertRaises(ValueError):module.validate(self.book,ROOT/'tests/fixtures/web')

if __name__=='__main__':unittest.main()
