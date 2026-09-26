// Learning UI: existing USER_PASSWORD_AUTH flow, TLS to Cognito, memory-only tokens.
export const REGION = 'ap-southeast-2';
export function validateConfig(endpoint, clientId) {
  endpoint = endpoint.trim().replace(/\/$/, '');
  clientId = clientId.trim();
  if (!/^https:\/\/[a-z0-9]+\.execute-api\.ap-southeast-2\.amazonaws\.com$/.test(endpoint))
    throw Error('CloudFormationのApiUrl（シドニー）を入力してください。');
  if (!/^[a-zA-Z0-9_+]{1,128}$/.test(clientId))
    throw Error('CloudFormationのClientIdを入力してください。');
  return {endpoint, clientId};
}
const messages = {
  NotAuthorizedException: 'ユーザー名・パスワード、またはログインの有効期限を確認してください。',
  UserNotFoundException: 'ユーザー名・パスワードを確認してください。',
  InvalidPasswordException: '12文字以上で、大文字・小文字・数字・記号を含むパスワードを設定してください。',
  TooManyRequestsException: '試行回数が多いため、少し待ってから再試行してください。',
  PasswordResetRequiredException: '管理者によるパスワードのリセットが必要です。',
  UserNotConfirmedException: 'ユーザーの確認が完了していません。Cognitoで状態を確認してください。',
  ResourceNotFoundException: 'ClientIdとリージョンを確認してください。',
  InvalidParameterException: '入力内容またはCognitoの認証設定を確認してください。'
};
export function createAuth(clientId, fetcher = fetch, now = Date.now) {
  let idToken = '', expiresAt = 0, challenge = null, username = '', generation = 0;
  function clear() { idToken = ''; expiresAt = 0; challenge = null; username = ''; generation++; }
  async function call(action, data) {
    let response;
    try {
      response = await fetcher(`https://cognito-idp.${REGION}.amazonaws.com/`, {
        method: 'POST', headers: {'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.' + action},
        body: JSON.stringify(data), signal: AbortSignal.timeout(20000)
      });
    } catch { throw Error('Cognitoに接続できません。通信環境を確認して再試行してください。'); }
    let result;
    try { result = await response.json(); } catch { throw Error('認証サービスからの応答を読み取れません。'); }
    if (!response.ok) {
      const type = String(result.__type || '').split('#').pop();
      throw Error(messages[type] || 'ログインに失敗しました。Cognitoの設定を確認してください。');
    }
    return result;
  }
  function accept(result) {
    if (result.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
      const required = JSON.parse(result.ChallengeParameters?.requiredAttributes || '[]');
      if (required.length) throw Error('追加のユーザー属性が必要です。Cognitoで設定を確認してください。');
      if (!result.Session) throw Error('初回ログインをやり直してください。');
      challenge = result.Session;
      username = result.ChallengeParameters?.USER_ID_FOR_SRP || result.ChallengeParameters?.USERNAME || username;
      return 'new-password';
    }
    if (result.ChallengeName) throw Error('この画面では対応していない追加認証が必要です。');
    if (!result.AuthenticationResult?.IdToken) throw Error('ログイン結果を確認できません。');
    idToken = result.AuthenticationResult.IdToken;
    // ID token lifetime is one hour in this template. API Gateway remains the verifier.
    expiresAt = now() + 3600000;
    challenge = null;
    return 'signed-in';
  }
  return {
    async signIn(name, password) {
      clear(); username = name.trim();
      const epoch = generation;
      const result = await call('InitiateAuth', {AuthFlow: 'USER_PASSWORD_AUTH', ClientId: clientId,
        AuthParameters: {USERNAME: username, PASSWORD: password}});
      if (epoch !== generation) throw Error('ログインは取り消されました。');
      return accept(result);
    },
    async newPassword(password) {
      if (!challenge) throw Error('最初からログインしてください。');
      const epoch = generation;
      const result = await call('RespondToAuthChallenge', {ClientId: clientId,
        ChallengeName: 'NEW_PASSWORD_REQUIRED', Session: challenge,
        ChallengeResponses: {USERNAME: username, NEW_PASSWORD: password}});
      if (epoch !== generation) throw Error('ログインは取り消されました。');
      return accept(result);
    },
    token() {
      if (!idToken) throw Error('ログインしてください。');
      if (now() >= expiresAt) { clear(); throw Error('ログインの有効期限が切れました。もう一度ログインしてください。'); }
      return idToken;
    },
    signOut: clear
  };
}
