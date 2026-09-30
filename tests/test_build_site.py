import json
import os
from unittest.mock import patch
import tempfile
import unittest
from pathlib import Path
from scripts.build_site import build, ASSETS, public_settings


class BuildSiteTests(unittest.TestCase):
    def test_only_allowlisted_assets_and_public_config(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            output = Path(folder)
            build(output, 'https://abc.execute-api.ap-southeast-2.amazonaws.com/', 'client')
            html = (output / 'index.html').read_text()
            self.assertNotIn('__APP_UPDATED_AT__', html)
            self.assertRegex(html, r'最終更新：<time>\d{4}/\d{2}/\d{2} \d{2}:\d{2} JST</time>')
            self.assertEqual({p.name for p in output.iterdir()}, set(ASSETS) | {'config.json'})
            self.assertEqual(json.loads((output / 'config.json').read_text()), {
                'endpoint': 'https://abc.execute-api.ap-southeast-2.amazonaws.com', 'clientId': 'client'})

    def test_unexpected_files_block_build(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            (Path(folder) / '.env').write_text('not-public')
            with self.assertRaises(ValueError):
                build(folder, 'https://abc.execute-api.ap-southeast-2.amazonaws.com', 'client')

    def test_invalid_config_does_not_create_output(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            output = Path(folder) / 'site'
            with self.assertRaises(ValueError):
                build(output, 'https://untrusted.example', 'client')
            self.assertFalse(output.exists())


class PublicSettingsTests(unittest.TestCase):
    def test_env_file_quotes_comments_and_environment_override(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {}, clear=True):
            path = Path(folder) / '.env'
            path.write_text('# Settings\nexport API_URL="https://example.test" # comment\nCOGNITO_CLIENT_ID=client\nAWS_SECRET_ACCESS_KEY=private\n')
            self.assertEqual(public_settings(path), {'API_URL': 'https://example.test', 'COGNITO_CLIENT_ID': 'client'})
            os.environ['API_URL'] = 'https://override.test'
            self.assertEqual(public_settings(path)['API_URL'], 'https://override.test')

    def test_missing_file_uses_environment(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {'API_URL': 'endpoint'}, clear=True):
            self.assertEqual(public_settings(Path(folder) / '.env'), {'API_URL': 'endpoint', 'COGNITO_CLIENT_ID': ''})

    def test_shell_expressions_are_not_executed(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {}, clear=True):
            path = Path(folder) / '.env'
            path.write_text("API_URL='$(echo example)'\n")
            self.assertEqual(public_settings(path)['API_URL'], '$(echo example)')
