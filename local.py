"""Loopback-only development server. Its fixed identity is never used in Lambda."""
import json
import os
import sqlite3
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from app.handler import handle

ROOT = Path(__file__).parent


def public_config():
    """Expose only the two public application settings, never all environment variables."""
    return {'endpoint': os.environ.get('API_URL', ''),
            'clientId': os.environ.get('COGNITO_CLIENT_ID', '')}


class LocalStore:
    def __init__(self, path):
        self.db = sqlite3.connect(path)
        self.db.execute('CREATE TABLE IF NOT EXISTS notes (owner TEXT, id TEXT, data TEXT, PRIMARY KEY(owner,id))')

    def list(self, owner):
        return [json.loads(row[0]) for row in self.db.execute(
            'SELECT data FROM notes WHERE owner=? ORDER BY id DESC LIMIT 50', (owner,))]

    def add(self, note):
        with self.db:
            self.db.execute('INSERT INTO notes VALUES (?,?,?)',
                            (note['owner'], note['id'], json.dumps(note)))


class Server(BaseHTTPRequestHandler):
    def do_GET(self):
        assets = {'/': ('index.html', 'text/html; charset=utf-8'),
                  '/app.mjs': ('app.mjs', 'text/javascript; charset=utf-8'),
                  '/auth.mjs': ('auth.mjs', 'text/javascript; charset=utf-8')}
        if self.path == '/config.json':
            data = json.dumps(public_config()).encode('utf-8')
            content_type = 'application/json; charset=utf-8'
        elif self.path in assets:
            filename, content_type = assets[self.path]
            data = (ROOT / 'web' / filename).read_bytes()
        else:
            self.api('GET')
            return
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        self.api('POST')

    def api(self, method):
        size = int(self.headers.get('Content-Length', '0'))
        if size < 0 or size > 16000:
            self.send_error(413)
            return
        event = {'rawPath': self.path, 'requestContext': {'http': {'method': method},
                 'authorizer': {'jwt': {'claims': {'sub': 'local-user'}}}},
                 'body': self.rfile.read(size).decode('utf-8', errors='replace')}
        result = handle(event, self.server.store)
        self.send_response(result['statusCode'])
        for key, value in result['headers'].items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(result['body'].encode())


if __name__ == '__main__':
    server = HTTPServer(('127.0.0.1', 8080), Server)
    server.store = LocalStore(ROOT / 'local.sqlite3')
    print('Open http://127.0.0.1:8080 — Ctrl+C to stop', flush=True)
    server.serve_forever()
