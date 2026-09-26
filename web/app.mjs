import {createAuth, validateConfig} from './auth.mjs';
const $ = id => document.getElementById(id);
let auth = null, endpoint = '', local = false, revision = 0, currentUser = '';
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
  revision++; auth?.signOut(); auth = null; local = false; endpoint = '';
  $('workspace').hidden = true; $('challenge-panel').hidden = true; $('login-panel').hidden = false;
  $('local-option').hidden = false; $('notes').replaceChildren(); $('content').value = '';
  for (const id of ['password','new-password','confirm-password']) $(id).value = '';
  $('mode').textContent = 'AWSのメモにログイン'; status(message);
}
async function api(method = 'GET', body) {
  const headers = {'Content-Type':'application/json'};
  if (!local) {
    try { headers.Authorization = 'Bearer ' + auth.token(); }
    catch { reset('ログインの有効期限が切れました。もう一度ログインしてください。'); throw Error('再ログインしてください。'); }
  }
  const response = await fetch(endpoint + '/notes', {method, headers,
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000)});
  if (response.status === 401 && !local) { reset('ログインを確認できません。もう一度ログインしてください。'); throw Error('再ログインしてください。'); }
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
  $('login-panel').hidden = true; $('challenge-panel').hidden = true; $('local-option').hidden = true; $('workspace').hidden = false;
  $('identity').textContent = local ? 'ローカルの練習用メモ' : currentUser + ' としてログイン中';
  $('mode').textContent = local ? 'ローカル環境（AWSには保存しません）' : 'AWS環境・シドニー';
  status(local ? 'ローカル環境を開きました。' : 'ログインしました。');
  try { await list(); } catch { if (!$('workspace').hidden) status('一覧を取得できませんでした。接続設定や通信を確認し、再読み込みしてください。'); }
}
async function next(state) {
  if (state === 'new-password') {
    $('login-panel').hidden = true; $('challenge-panel').hidden = false; $('local-option').hidden = true;
    status('初回のため、新しいパスワードを設定してください。'); $('new-password').focus();
  } else await showWorkspace();
}
$('login-form').onsubmit = async event => {
  event.preventDefault(); $('login-fields').disabled = true; $('local').disabled = true; status('ログインしています…');
  try {
    await connectionReady;
    if (!connection) throw Error('アプリの接続設定が完了していません。管理者にお問い合わせください。');
    const config = connection;
    endpoint = config.endpoint; local = false; revision++; currentUser = $('username').value.trim();
    auth?.signOut(); auth = createAuth(config.clientId);
    const password = $('password').value; $('password').value = '';
    await next(await auth.signIn(currentUser, password));
  } catch (error) { status(error.message); }
  finally { $('password').value = ''; $('login-fields').disabled = false; $('local').disabled = false; }
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
  finally { $('challenge-fields').disabled = false; $('new-password').value = ''; $('confirm-password').value = ''; }
};
$('cancel').onclick = () => reset();
$('logout').onclick = () => reset('この画面からログアウトしました。');
$('local').onclick = async () => { reset(); local = true; await showWorkspace(); };
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
