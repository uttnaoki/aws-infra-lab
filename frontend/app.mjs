import {createAuth, validateConfig} from './auth.mjs';
const $ = id => document.getElementById(id);
const passwordFields = ['password', 'signup-password', 'signup-password-confirm', 'new-password', 'confirm-password'];
function passwordVisibility(id, visible) {
  $(id).type = visible ? 'text' : 'password';
  const button = $('toggle-' + id), label = visible ? 'パスワードを隠す' : 'パスワードを表示';
  button.setAttribute('aria-pressed', String(visible));
  button.setAttribute('aria-label', label); button.title = label;
}
function hidePasswords() { for (const id of passwordFields) passwordVisibility(id, false); }
for (const id of passwordFields) {
  $('toggle-' + id).onclick = () => passwordVisibility(id, $(id).type === 'password');
}
hidePasswords();
let auth = null, endpoint = '', revision = 0, currentUser = '';
let connection = null;

// Connection settings belong to the application, never to the login form.
const connectionReady = fetch('/config.json', {cache: 'no-store'})
  .then(response => {
    if (!response.ok) throw Error('設定を読み込めませんでした。');
    return response.json();
  })
  .then(config => { connection = validateConfig(config.endpoint, config.clientId); })
  .catch(() => { status('アプリの接続設定が完了していません。管理者にお問い合わせください。'); });
function status(text) { $('status').textContent = text; }
function reset(message = '') {
  hidePasswords();
  revision++; auth?.signOut(); auth = null; endpoint = '';
  $('signup-panel').hidden = true; $('confirmation-panel').hidden = true;
  $('workspace').hidden = true; $('challenge-panel').hidden = true; $('login-panel').hidden = false;
  $('notes').replaceChildren(); $('content').value = '';
  for (const id of ['password','new-password','confirm-password','signup-password','signup-password-confirm','confirmation-code']) $(id).value = '';
  $('mode').hidden = true; $('mode').hidden = true; status(message);
}
async function api(method = 'GET', body) {
  const headers = {'Content-Type':'application/json'};
  {
    try { headers.Authorization = 'Bearer ' + auth.token(); }
    catch { reset('ログインの有効期限が切れました。もう一度ログインしてください。'); throw Error('再ログインしてください。'); }
  }
  const response = await fetch(endpoint + '/notes', {method, headers,
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000)});
  if (response.status === 401) { reset('ログインを確認できません。もう一度ログインしてください。'); throw Error('再ログインしてください。'); }
  const data = await response.json();
  if (!response.ok) throw Error(data.message || 'APIの処理に失敗しました。');
  return data;
}
async function list() {
  const epoch = revision;
  const data = await api();
  if (epoch !== revision) return;
  $('notes').replaceChildren();
  for (const note of data.notes) {
    const card = document.createElement('article'), time = document.createElement('small'), p = document.createElement('p');
    time.textContent = new Date(note.createdAt).toLocaleString('ja-JP'); p.textContent = note.content;
    card.append(time,p); $('notes').append(card);
  }
  if (!data.notes.length) $('notes').textContent = 'まだメモはありません。最初の1件を保存してみましょう。';
}
async function showWorkspace() {
  $('login-panel').hidden = true; $('challenge-panel').hidden = true; $('workspace').hidden = false;
  $('identity').textContent = currentUser + ' としてログイン中';
  status('ログインしました。');
  try { await list(); } catch { if (!$('workspace').hidden) status('一覧を取得できませんでした。接続設定や通信を確認し、再読み込みしてください。'); }
}
async function next(state) {
  if (state === 'new-password') {
    $('login-panel').hidden = true; $('challenge-panel').hidden = false;
    status('初回のため、新しいパスワードを設定してください。'); $('new-password').focus();
  } else await showWorkspace();
}
$('login-form').onsubmit = async event => {
  event.preventDefault(); $('login-fields').disabled = true; status('ログインしています…');
  try {
    await connectionReady;
    if (!connection) throw Error('アプリの接続設定が完了していません。管理者にお問い合わせください。');
    const config = connection;
    endpoint = config.endpoint; revision++; currentUser = $('username').value.trim();
    auth?.signOut(); auth = createAuth(config.clientId);
    const password = $('password').value; $('password').value = '';
    await next(await auth.signIn(currentUser, password));
  } catch (error) { status(error.message); }
  finally { hidePasswords(); $('password').value = ''; $('login-fields').disabled = false; }
};
$('challenge-form').onsubmit = async event => {
  event.preventDefault();
  const password = $('new-password').value;
  if (password !== $('confirm-password').value) { status('確認用パスワードが一致していません。'); return; }
  if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9\s]/.test(password)) {
    status('12文字以上で、大文字・小文字・数字・記号を含めてください。'); return;
  }
  $('challenge-fields').disabled = true; status('パスワードを変更しています…');
  try { await next(await auth.newPassword(password)); } catch (error) { status(error.message); }
  finally { hidePasswords(); $('challenge-fields').disabled = false; $('new-password').value = ''; $('confirm-password').value = ''; }
};
$('cancel').onclick = () => reset();
$('logout').onclick = () => reset('この画面からログアウトしました。');
$('reload').onclick = async () => {
  $('reload').disabled = true;
  try { await list(); if (!$('workspace').hidden) status('一覧を更新しました。'); }
  catch { if (!$('workspace').hidden) status('一覧を取得できませんでした。通信環境を確認してください。'); }
  finally { $('reload').disabled = false; }
};
$('note-form').onsubmit = async event => {
  event.preventDefault(); $('save').disabled = true; const epoch = revision;
  try {
    await api('POST', {content:$('content').value});
    if (epoch !== revision) return;
    $('content').value = ''; status('保存しました。');
    try { await list(); } catch { if (epoch === revision) status('保存しましたが一覧の更新に失敗しました。再読み込みしてください。'); }
  } catch { if (epoch === revision) status('保存結果を確認できません。再送する前に一覧を再読み込みしてください。'); }
  finally { $('save').disabled = false; }
};

function registrationPanel(id) {
  reset(); $('login-panel').hidden = true; $(id).hidden = false;
  $('mode').hidden = true;
}
async function registrationAuth() {
  await connectionReady;
  if (!connection) throw Error('アプリの接続設定が完了していません。管理者にお問い合わせください。');
  return createAuth(connection.clientId);
}
$('open-signup').onclick = () => { registrationPanel('signup-panel'); $('signup-username').focus(); };
$('open-confirm').onclick = () => { registrationPanel('confirmation-panel'); $('confirmation-username').value = $('username').value.trim(); };
$('signup-back').onclick = $('confirmation-back').onclick = () => reset();
$('signup-form').onsubmit = async event => {
  event.preventDefault();
  const password = $('signup-password').value;
  if (password !== $('signup-password-confirm').value) { status('確認用パスワードが一致していません。'); return; }
  if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9\s]/.test(password)) {
    status('12文字以上で、大文字・小文字・数字・記号を含めてください。'); return;
  }
  const name = $('signup-username').value.trim(), email = $('signup-email').value.trim();
  const epoch = revision; $('signup-fields').disabled = true; status('登録しています…');
  try {
    const client = await registrationAuth();
    const result = await client.signUp(name, email, password);
    if (epoch !== revision) return;
    if (result === 'confirmed') { reset('登録が完了しました。ログインしてください。'); $('username').value = name; }
    else {
      registrationPanel('confirmation-panel'); $('confirmation-username').value = name;
      status(result === 'delivery-pending' ? '登録確認が必要です。メールの送信に失敗したため、時間をおいて確認コードを再送してください。' : 'メールに届いた確認コードを入力してください。');
      $('confirmation-code').focus();
    }
  } catch (error) { if (epoch === revision) status(error.message + ' 通信が途切れた場合は「登録の確認・コード再送」から確認できます。'); }
  finally { hidePasswords(); $('signup-fields').disabled = false; $('signup-password').value = ''; $('signup-password-confirm').value = ''; }
};
async function confirmRegistration(resend) {
  const name = $('confirmation-username').value.trim();
  if (!name) { status('ユーザー名を入力してください。'); return; }
  const code = $('confirmation-code').value.trim(), epoch = revision;
  $('confirmation-fields').disabled = true; status(resend ? '確認コードを再送しています…' : '確認しています…');
  try {
    const client = await registrationAuth();
    if (resend) await client.resendSignUp(name); else await client.confirmSignUp(name, code);
    if (epoch !== revision) return;
    if (resend) status('確認コードを送信しました。メールを確認してください。');
    else { reset('登録が完了しました。ユーザー名とパスワードでログインしてください。'); $('username').value = name; $('password').focus(); }
  } catch (error) { if (epoch === revision) status(error.message); }
  finally { $('confirmation-fields').disabled = false; $('confirmation-code').value = ''; }
}
$('confirmation-form').onsubmit = event => { event.preventDefault(); return confirmRegistration(false); };
$('resend-code').onclick = () => confirmRegistration(true);
