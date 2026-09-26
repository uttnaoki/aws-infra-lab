import json
import tempfile
import unittest
from pathlib import Path
from scripts.build_site import build, ASSETS


class BuildSiteTests(unittest.TestCase):
    def test_only_allowlisted_assets_and_public_config(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            output = Path(folder)
            build(output, 'https://abc.execute-api.ap-southeast-2.amazonaws.com/', 'client')
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
