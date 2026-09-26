"""Build only public website files. No AWS calls, credentials or local DB copies."""
import json
import os
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ('index.html', 'app.mjs', 'auth.mjs')


def build(output, endpoint, client_id):
    endpoint = endpoint.strip().rstrip('/')
    client_id = client_id.strip()
    if not re.fullmatch(r'https://[a-z0-9]+\.execute-api\.ap-southeast-2\.amazonaws\.com', endpoint):
        raise ValueError('Set API_URL to the Sydney ApiUrl stack output')
    if not re.fullmatch(r'[a-zA-Z0-9_+]{1,128}', client_id):
        raise ValueError('Set COGNITO_CLIENT_ID to the ClientId stack output')
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    # Refuse to publish unexpected leftovers; never recursively copy the repository.
    allowed = set(ASSETS) | {'config.json'}
    if any(p.name not in allowed or not p.is_file() or p.is_symlink() for p in output.iterdir()):
        raise ValueError('Output directory contains unexpected files; inspect it before continuing')
    for name in ASSETS:
        shutil.copyfile(ROOT / 'web' / name, output / name)
    (output / 'config.json').write_text(json.dumps({
        'endpoint': endpoint, 'clientId': client_id}, indent=2) + '\n')


if __name__ == '__main__':
    try:
        build(ROOT / 'dist', os.environ.get('API_URL', ''), os.environ.get('COGNITO_CLIENT_ID', ''))
    except ValueError as error:
        raise SystemExit(str(error)) from None
    print('Public website files prepared in dist/ (4 files).')
