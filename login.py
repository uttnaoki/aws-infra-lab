"""Obtain a short-lived lab ID token without putting passwords in shell history."""
import getpass
import json
import urllib.request
import urllib.error


def call(region, action, body):
    req = urllib.request.Request(
        f'https://cognito-idp.{region}.amazonaws.com/',
        data=json.dumps(body).encode(), headers={
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': 'AWSCognitoIdentityProviderService.' + action})
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.load(response)


if __name__ == '__main__':
    region = input('Region [ap-northeast-1]: ').strip() or 'ap-northeast-1'
    if not all(c.isascii() and (c.isalnum() or c == '-') for c in region):
        raise SystemExit('Invalid region')
    client = input('ClientId: ').strip()
    username = input('Username: ').strip()
    try:
        result = call(region, 'InitiateAuth', {
            'AuthFlow': 'USER_PASSWORD_AUTH', 'ClientId': client,
            'AuthParameters': {'USERNAME': username, 'PASSWORD': getpass.getpass('Password: ')}})
        if result.get('ChallengeName') == 'NEW_PASSWORD_REQUIRED':
            result = call(region, 'RespondToAuthChallenge', {
                'ClientId': client, 'ChallengeName': 'NEW_PASSWORD_REQUIRED',
                'Session': result['Session'], 'ChallengeResponses': {
                    'USERNAME': username, 'NEW_PASSWORD': getpass.getpass('New permanent password: ')}})
        if 'AuthenticationResult' not in result:
            raise SystemExit('Additional authentication is required: ' + result.get('ChallengeName', 'unknown'))
        print('\nID token (private; expires in about one hour):\n')
        print(result['AuthenticationResult']['IdToken'])
    except urllib.error.HTTPError as error:
        raise SystemExit('Cognito rejected the request: ' + str(error.code)) from None
