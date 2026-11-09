"""Check the manual schema's identity, referential integrity and SQL contract offline."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
SQL = (ROOT / 'docs/schema.sql').read_text()
TABLES = dict(re.findall(r'CREATE TABLE IF NOT EXISTS `(\w+)` \((.*?)\n\) ENGINE=', SQL, re.S))

def columns(body):
    return dict(re.findall(r'^    `(\w+)` (.+?)(?:,)?$', body, re.M))

def identifiers(value):
    return re.findall(r'`(\w+)`', value)

class SchemaTests(unittest.TestCase):
    def test_every_table_has_generated_primary_key_and_business_uniqueness(self):
        self.assertEqual(set(TABLES), {'books', 'book_licenses', 'age_ranges', 'categories', 'languages', 'book_age_ranges', 'book_categories', 'book_languages', 'book_pages', 'book_voices'})
        for name, body in TABLES.items():
            with self.subTest(table=name):
                fields = columns(body)
                self.assertIn('int unsigned NOT NULL AUTO_INCREMENT', fields['id'])
                self.assertEqual(re.findall(r'PRIMARY KEY \((.*?)\)', body), ['`id`'])
                self.assertRegex(body, r'UNIQUE KEY `\w+` \(')
                self.assertIn('timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP', fields['created_at'])
                self.assertIn('ON UPDATE CURRENT_TIMESTAMP', fields['updated_at'])
                for field, declaration in fields.items():
                    self.assertRegex(declaration, r"COMMENT '.+'", name + '.' + field)

    def test_foreign_keys_target_matching_unique_business_keys(self):
        created = set()
        count = 0
        for name, body in TABLES.items():
            for local, parent, remote in re.findall(r'FOREIGN KEY \((.*?)\) REFERENCES `(\w+)` \((.*?)\)', body):
                count += 1
                self.assertIn(parent, created, name + ' references a table not yet created')
                local_columns, remote_columns = identifiers(local), identifiers(remote)
                self.assertEqual(len(local_columns), len(remote_columns))
                keys = [identifiers(key) for key in re.findall(r'UNIQUE KEY `\w+` \((.*?)\)', TABLES[parent])]
                self.assertIn(remote_columns, keys, name + ' references a nonunique key')
                for left, right in zip(local_columns, remote_columns):
                    left_type = columns(body)[left].split(' NOT NULL')[0]
                    right_type = columns(TABLES[parent])[right].split(' NOT NULL')[0]
                    self.assertEqual(left_type, right_type, name + '.' + left)
            created.add(name)
        self.assertEqual(count, 9)

    def test_flags_are_documented_zero_one_integers(self):
        self.assertNotRegex(SQL, r'(?i)\b(?:BOOLEAN|BOOL|DEFAULT TRUE|DEFAULT FALSE)\b')
        for table, flags in {'books': ['is_demo'], 'book_licenses': ['commercial_use', 'self_hosting', 'translation_allowed', 'audio_derivative_allowed']}.items():
            for field in flags:
                self.assertIn("tinyint unsigned NOT NULL DEFAULT '0'", columns(TABLES[table])[field])
                self.assertIn('0 否、1 是', columns(TABLES[table])[field])
        self.assertNotRegex(SQL, r'(?i)\bCHECK\s*\(')
        self.assertNotRegex(SQL, r',\s*\) ENGINE=')

    def test_dictionary_seed_preserves_generated_ids_and_expected_options(self):
        for table, key, count in [('age_ranges', 'age_id', 3), ('categories', 'category_id', 6), ('languages', 'language_id', 2)]:
            match = re.search(r'INSERT INTO `' + table + r'` \((.*?)\) VALUES(.*?)ON DUPLICATE KEY UPDATE', SQL, re.S)
            self.assertIsNotNone(match)
            self.assertIn(key, identifiers(match[1]))
            self.assertNotIn('id', identifiers(match[1]))
            self.assertEqual(len(re.findall(r"\('[^']+'", match[2])), count)
        self.assertNotRegex(SQL, r'(?im)^\s*(?:DROP|TRUNCATE|DELETE FROM|CREATE DATABASE|USE)\b')

    def test_repository_sql_uses_business_ids(self):
        store = (ROOT / 'internal/repository/store.go').read_text()
        query = (ROOT / 'internal/repository/query.go').read_text()
        importer = (ROOT / 'internal/repository/import.go').read_text()
        self.assertIn('SELECT b.book_id,', store)
        self.assertIn('AND b.book_id=?', store)
        self.assertIn('b.book_id IN (', query)
        self.assertIn('c.category_id=bc.category_id', query)
        self.assertNotRegex(store + query, r'\b(?:b|c)\.id\b')
        # Explicit INSERT columns must exist and leave the generated id to MySQL.
        for table, column_list in re.findall(r'INSERT INTO (\w+)\s*\((.*?)\)', importer, re.S):
            with self.subTest(insert=table):
                fields = [x.strip() for x in column_list.split(',')]
                self.assertNotIn('id', fields)
                self.assertTrue(set(fields).issubset(columns(TABLES[table])))

if __name__ == '__main__':
    unittest.main()
