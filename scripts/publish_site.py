"""Build and upload the four public assets using the user's AWS CLI session."""
import re
import shutil
import subprocess

if __package__:
    from .build_site import ROOT, build, public_settings
else:
    from build_site import ROOT, build, public_settings

KEYS = ('API_URL', 'COGNITO_CLIENT_ID', 'AWS_PROFILE', 'AWS_REGION', 'WEBSITE_BUCKET')
UPLOADS = (
    ('auth.mjs', 'text/javascript'),
    ('app.mjs', 'text/javascript'),
    ('config.json', 'application/json'),
    ('index.html', 'text/html'),
)


def publish():
    settings = public_settings(keys=KEYS)
    for key in KEYS:
        if not settings[key].strip():
            raise ValueError(f'Set {key} in .env')
    if settings['AWS_REGION'] != 'ap-southeast-2':
        raise ValueError('AWS_REGION must be ap-southeast-2 for this project')
    bucket = settings['WEBSITE_BUCKET']
    if not re.fullmatch(r'[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]', bucket):
        raise ValueError('WEBSITE_BUCKET must be a bucket name, without s3:// or a path')
    aws = shutil.which('aws')
    if not aws:
        raise ValueError('AWS CLI was not found. Make aws available on PATH.')
    output = ROOT / 'dist'
    build(output, settings['API_URL'], settings['COGNITO_CLIENT_ID'])
    print('Public files generated. Uploading 4 files...', flush=True)
    for name, content_type in UPLOADS:
        subprocess.run([
            aws, 's3', 'cp', str(output / name), f's3://{bucket}/{name}',
            '--profile', settings['AWS_PROFILE'], '--region', settings['AWS_REGION'],
            '--content-type', content_type + '; charset=utf-8',
            '--cache-control', 'no-store', '--no-cli-pager',
        ], check=True)
    print('Upload complete (4 files). Reload the public website to verify.')


if __name__ == '__main__':
    try:
        publish()
    except (ValueError, OSError) as error:
        raise SystemExit(str(error)) from None
    except subprocess.CalledProcessError:
        raise SystemExit('Upload stopped. Some files may already be uploaded. Fix the AWS CLI error and rerun this command. If the session expired, sign in again with aws login --profile <your profile>.') from None
