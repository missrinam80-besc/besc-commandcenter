import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('token_setup', Path(__file__).resolve().parents[1] / 'scripts' / 'besc-dev-agent-token.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Fixture:
    def __init__(self, text='', mode=0o100600):
        self.text = text
        self.mode = mode
    def is_symlink(self):
        return False
    def stat(self):
        return SimpleNamespace(st_mode=self.mode, st_nlink=1, st_uid=0)
    def read_bytes(self):
        return self.text.encode('utf-8')


class Guards(unittest.TestCase):
    def inspect(self, text='', mode=0o100600, ignored=0):
        with patch.object(module, 'ROOT', Path.cwd()), patch.object(module, 'ENV', Fixture(text, mode)), \
                patch.object(module.os, 'geteuid', return_value=0, create=True), \
                patch.object(module.subprocess, 'run', return_value=SimpleNamespace(returncode=ignored)):
            return module.prepare()
    def test_unrelated_settings_preserved(self):
        result = self.inspect('OTHER=TESTFIXTURE\n')
        self.assertEqual(result[2], ['OTHER=TESTFIXTURE\n'])
    def test_existing_token_rejected(self):
        with self.assertRaises(ValueError):
            self.inspect(module.TOKEN_KEY + '=TESTFIXTURE\n')
    def test_duplicate_token_rejected(self):
        with self.assertRaises(ValueError):
            self.inspect((module.TOKEN_KEY + '=\n') * 2)
    def test_other_channel_rejected(self):
        with self.assertRaises(ValueError):
            self.inspect(module.CHANNEL_KEY + '=agtch_TESTFIXTURE\n')
    def test_unprotected_file_rejected(self):
        with self.assertRaises(ValueError):
            self.inspect(mode=0o100644)
    def test_nonignored_file_rejected(self):
        with self.assertRaises(ValueError):
            self.inspect(ignored=1)


if __name__ == '__main__':
    unittest.main()
