import subprocess
import unittest
from unittest.mock import patch
from scripts import publish_site

SETTINGS = dict(API_URL='https://abc.execute-api.ap-southeast-2.amazonaws.com',
                COGNITO_CLIENT_ID='client', AWS_PROFILE='test-profile',
                AWS_REGION='ap-southeast-2', WEBSITE_BUCKET='test-website')


class PublishSiteTests(unittest.TestCase):
    def setUp(self):
        self.settings = patch.object(publish_site, 'public_settings', return_value=SETTINGS.copy()).start()
        patch.object(publish_site.shutil, 'which', return_value='/test/aws').start()
        self.build = patch.object(publish_site, 'build').start()
        self.run = patch.object(publish_site.subprocess, 'run').start()
        self.addCleanup(patch.stopall)

    def test_uploads_only_public_files_with_types_and_html_last(self):
        publish_site.publish()
        self.build.assert_called_once()
        self.assertEqual(self.run.call_count, 4)
        for call, (name, mime) in zip(self.run.call_args_list, publish_site.UPLOADS):
            args = call.args[0]
            self.assertEqual(args[4], f's3://test-website/{name}')
            self.assertEqual(args[args.index('--content-type') + 1], mime + '; charset=utf-8')
            self.assertEqual(args[args.index('--profile') + 1], 'test-profile')
            self.assertEqual(args[args.index('--region') + 1], 'ap-southeast-2')
            self.assertEqual(args[args.index('--cache-control') + 1], 'no-store')
            self.assertTrue(call.kwargs['check'])
        self.assertTrue(self.run.call_args.args[0][4].endswith('/index.html'))

    def test_upload_failure_stops_before_html(self):
        self.run.side_effect = subprocess.CalledProcessError(1, 'aws')
        with self.assertRaises(subprocess.CalledProcessError):
            publish_site.publish()
        self.assertEqual(self.run.call_count, 1)

    def test_invalid_settings_stop_before_build_or_upload(self):
        for key, value in [('WEBSITE_BUCKET', ''), ('WEBSITE_BUCKET', 's3://wrong/path'),
                           ('AWS_REGION', 'ap-northeast-1'), ('AWS_PROFILE', '')]:
            self.settings.return_value = SETTINGS | {key: value}
            with self.assertRaises(ValueError):
                publish_site.publish()
        self.build.assert_not_called()
        self.run.assert_not_called()

    def test_build_failure_does_not_upload(self):
        self.build.side_effect = ValueError('Unexpected output file')
        with self.assertRaises(ValueError):
            publish_site.publish()
        self.run.assert_not_called()
