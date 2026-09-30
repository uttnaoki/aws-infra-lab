"""Build only public website files. No AWS calls, credentials or local DB copies."""
import json
import os
import re
import shutil
import shlex
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ('index.html', 'app.mjs', 'auth.mjs')



def public_settings(env_path=ROOT / '.env', keys=('API_URL', 'COGNITO_CLIENT_ID')):
    """Read public build settings as data; never execute shell expressions."""
    settings = {}
    if env_path.exists():
        for line_number, line in enumerate(env_path.read_text(encoding='utf-8').splitlines(), 1):
            line = line.strip()
            if line.startswith('export '):
                line = line[7:].lstrip()
            key, separator, value = line.partition('=')
            key = key.strip()
            if not separator or key not in keys:
                continue
            try:
                parts = shlex.split(value, comments=True, posix=True)
                if len(parts) > 1:
                    raise ValueError()
            except ValueError:
                raise ValueError(f'Invalid .env setting on line {line_number}: {key}') from None
            settings[key] = parts[0] if parts else ''
    return {key: os.environ.get(key, settings.get(key, ''))
            for key in keys}


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
    updated_at = datetime.now(timezone(timedelta(hours=9))).strftime('%Y/%m/%d %H:%M JST')
    for name in ASSETS:
        source = ROOT / 'frontend' / name
        if name == 'index.html':
            (output / name).write_text(source.read_text().replace('__APP_UPDATED_AT__', updated_at))
        else:
            shutil.copyfile(source, output / name)
    (output / 'config.json').write_text(json.dumps({
        'endpoint': endpoint, 'clientId': client_id}, indent=2) + '\n')


if __name__ == '__main__':
    try:
        settings = public_settings()
        build(ROOT / 'dist', settings['API_URL'], settings['COGNITO_CLIENT_ID'])
    except ValueError as error:
        raise SystemExit(str(error)) from None
    print('Public website files prepared in dist/ (4 files).')
