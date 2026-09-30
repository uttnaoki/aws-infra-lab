import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('registration UI confirms, resumes and clears passwords without logging in', async()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],{value:'',hidden:false,disabled:false,textContent:'',focus(){},replaceChildren(){},setAttribute(key,value){this[key]=value;}}]));
  const original={document:globalThis.document,location:globalThis.location,fetch:globalThis.fetch};
  const requests=[];
  try {
    globalThis.document={getElementById:id=>{assert.ok(elements.has(id),id);return elements.get(id);}};
    globalThis.location={hostname:'example.test'};
    globalThis.fetch=async(url,options)=>{
      if(url==='/config.json')return {ok:true,json:async()=>({endpoint:'https://abc.execute-api.ap-southeast-2.amazonaws.com',clientId:'client'})};
      requests.push(options.headers['X-Amz-Target'].split('.').pop());
      return {ok:true,json:async()=>({UserConfirmed:false})};
    };
    await import('../app.mjs');
    const el=id=>elements.get(id),event={preventDefault(){}};
    el('password').value='DummyPassword123!';
    el('toggle-password').onclick();
    assert.equal(el('password').type,'text');
    assert.equal(el('toggle-password')['aria-pressed'],'true');
    assert.equal(el('password').value,'DummyPassword123!');
    el('toggle-password').onclick();
    assert.equal(el('password').type,'password');
    el('toggle-password').onclick();
    el('open-signup').onclick();
    assert.equal(el('password').type,'password');
    assert.equal(el('login-panel').hidden,true);
    el('signup-username').value='alice';el('signup-email').value='alice@example.test';
    el('signup-password').value=el('signup-password-confirm').value='DummyPassword123!';
    await el('signup-form').onsubmit(event);
    assert.equal(el('signup-password').value,'');
    assert.equal(el('confirmation-panel').hidden,false);
    assert.equal(el('confirmation-username').value,'alice');
    await el('resend-code').onclick();
    el('confirmation-code').value='123456';
    await el('confirmation-form').onsubmit(event);
    assert.equal(el('login-panel').hidden,false);
    assert.equal(el('workspace').hidden,true);
    assert.equal(el('username').value,'alice');
    assert.equal(el('confirmation-code').value,'');
    assert.deepEqual(requests,['SignUp','ResendConfirmationCode','ConfirmSignUp']);
    el('open-confirm').onclick();
    assert.equal(el('confirmation-username').value,'alice');
  } finally { Object.assign(globalThis,original); }
});
