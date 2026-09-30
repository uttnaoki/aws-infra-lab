"""The same application logic runs locally and in Lambda."""
import base64
import json
import os
import uuid
from datetime import datetime, timezone


class DynamoStore:
    def __init__(self):
        import boto3
        self.table = boto3.resource('dynamodb').Table(os.environ['TABLE_NAME'])

    def list(self, owner):
        from boto3.dynamodb.conditions import Key
        return self.table.query(KeyConditionExpression=Key('owner').eq(owner),
                                ScanIndexForward=False, Limit=50, ConsistentRead=True)['Items']

    def add(self, note):
        self.table.put_item(Item=note, ConditionExpression='attribute_not_exists(id)')


def respond(status, data):
    return {'statusCode': status, 'headers': {'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'}, 'body': json.dumps(data, ensure_ascii=False)}


def handle(event, store):
    claims = event.get('requestContext', {}).get('authorizer', {}).get('jwt', {}).get('claims', {})
    owner = claims.get('sub')
    if not owner:
        return respond(401, {'message': 'ログインが必要です。'})
    method = event.get('requestContext', {}).get('http', {}).get('method')
    if event.get('rawPath') != '/notes':
        return respond(404, {'message': '見つかりません。'})
    if method == 'GET':
        return respond(200, {'notes': store.list(owner)})
    if method != 'POST':
        return respond(405, {'message': '許可されていない操作です。'})
    try:
        raw = event.get('body') or ''
        if event.get('isBase64Encoded'):
            raw = base64.b64decode(raw, validate=True).decode('utf-8')
        if len(raw.encode('utf-8')) > 16000:
            return respond(413, {'message': '入力が大きすぎます。'})
        body = json.loads(raw)
        content = body.get('content') if isinstance(body, dict) else None
        if not isinstance(content, str) or not 1 <= len(content.strip()) <= 2000:
            raise ValueError('content')
    except (ValueError, UnicodeError):
        return respond(400, {'message': 'メモを1〜2000文字で入力してください。'})
    now = datetime.now(timezone.utc).isoformat()
    note = {'owner': owner, 'id': now + '#' + str(uuid.uuid4()),
            'createdAt': now, 'content': content.strip()}
    store.add(note)
    return respond(201, note)


def handler(event, context):
    return handle(event, DynamoStore())
