import os
import unittest
from unittest.mock import patch
from local import public_config


class PublicConfigTests(unittest.TestCase):
    def test_only_public_settings_are_exposed(self):
        with patch.dict(os.environ, {
            'API_URL': 'https://example.test',
            'COGNITO_CLIENT_ID': 'example',
            'AWS_SECRET_ACCESS_KEY': 'must-not-be-exposed',
        }, clear=True):
            self.assertEqual(public_config(), {
                'endpoint': 'https://example.test', 'clientId': 'example'})

    def test_missing_settings_allow_local_mode(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(public_config(), {'endpoint': '', 'clientId': ''})
