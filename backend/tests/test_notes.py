import json
import unittest
from backend.app.handler import handle
from local import LocalStore


def event(method='GET', owner='alice', body=None):
    return {'rawPath': '/notes', 'requestContext': {'http': {'method': method},
            'authorizer': {'jwt': {'claims': {'sub': owner} if owner else {}}}},
            'body': json.dumps(body) if body is not None else ''}


class NotesTest(unittest.TestCase):
    def setUp(self):
        self.store = LocalStore(':memory:')

    def tearDown(self):
        self.store.db.close()

    def test_owner_is_from_verified_claim_not_body(self):
        result = handle(event('POST', body={'content': 'hello', 'owner': 'bob'}), self.store)
        self.assertEqual(result['statusCode'], 201)
        self.assertEqual(self.store.list('bob'), [])
        self.assertEqual(self.store.list('alice')[0]['content'], 'hello')

    def test_no_identity_is_rejected(self):
        self.assertEqual(handle(event(owner=None), self.store)['statusCode'], 401)

    def test_invalid_input_is_rejected(self):
        for body in ({}, [], {'content': ' '}, {'content': 1}, {'content': 'x' * 2001}):
            self.assertEqual(handle(event('POST', body=body), self.store)['statusCode'], 400)

    def test_list_is_limited_and_newest_first(self):
        for number in range(55):
            handle(event('POST', body={'content': str(number)}), self.store)
        notes = json.loads(handle(event(), self.store)['body'])['notes']
        self.assertEqual(len(notes), 50)
        self.assertEqual(notes[0]['content'], '54')

    def test_invalid_json(self):
        request = event('POST')
        request['body'] = '{'
        self.assertEqual(handle(request, self.store)['statusCode'], 400)


if __name__ == '__main__':
    unittest.main()
