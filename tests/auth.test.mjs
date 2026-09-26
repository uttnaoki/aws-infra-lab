import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuth, validateConfig} from '../web/auth.mjs';
const ok = body => ({ok:true, json:async()=>body});
const signed = () => ok({AuthenticationResult:{IdToken:'test-token'}});
test('normal login, expiration and local logout', async()=>{
  let time = 0;
  const auth = createAuth('client', async()=>signed(), ()=>time);
  assert.equal(await auth.signIn('alice','secret'), 'signed-in');
  assert.equal(auth.token(),'test-token');
  time = 3600000; assert.throws(()=>auth.token());
  await auth.signIn('alice','secret'); auth.signOut(); assert.throws(()=>auth.token());
});
test('temporary password challenge carries session and canonical username', async()=>{
  const calls=[];
  const auth=createAuth('client',async(url,options)=>{
    calls.push(JSON.parse(options.body));
    if(calls.length===1) return ok({ChallengeName:'NEW_PASSWORD_REQUIRED',Session:'session',
      ChallengeParameters:{USER_ID_FOR_SRP:'canonical-user',requiredAttributes:'[]'}});
    return signed();
  });
  assert.equal(await auth.signIn('alias','temporary'),'new-password');
  assert.throws(()=>auth.token());
  assert.equal(await auth.newPassword('NewPassword123!'),'signed-in');
  assert.equal(calls[1].Session,'session');
  assert.equal(calls[1].ChallengeResponses.USERNAME,'canonical-user');
  assert.equal(calls[1].ChallengeResponses.NEW_PASSWORD,'NewPassword123!');
});
test('invalid credentials never create a session or expose raw AWS errors', async()=>{
  const auth=createAuth('client',async()=>({ok:false,json:async()=>({__type:'NotAuthorizedException',message:'private detail'})}));
  await assert.rejects(auth.signIn('alice','wrong'), error=>!error.message.includes('private detail'));
  assert.throws(()=>auth.token());
});
test('failed password change can be retried', async()=>{
  let call=0;
  const auth=createAuth('client',async()=>{
    call++;
    if(call===1) return ok({ChallengeName:'NEW_PASSWORD_REQUIRED',Session:'session'});
    if(call===2) return {ok:false,json:async()=>({__type:'InvalidPasswordException'})};
    return signed();
  });
  await auth.signIn('alice','temporary');
  await assert.rejects(auth.newPassword('bad'));
  assert.equal(await auth.newPassword('NewPassword123!'),'signed-in');
});
test('unsupported challenges never count as signed in',async()=>{
  const auth=createAuth('client',async()=>ok({ChallengeName:'SMS_MFA'}));
  await assert.rejects(auth.signIn('alice','secret'));assert.throws(()=>auth.token());
});
test('logout cancels a pending login response',async()=>{
  let finish;
  const auth=createAuth('client',()=>new Promise(resolve=>{finish=resolve;}));
  const pending=auth.signIn('alice','secret');auth.signOut();finish(signed());
  await assert.rejects(pending);assert.throws(()=>auth.token());
});
test('tokens are restricted to the Sydney API origin format',()=>{
  assert.equal(validateConfig('https://abc.execute-api.ap-southeast-2.amazonaws.com/','client').clientId,'client');
  for(const endpoint of ['https://attacker.example','http://abc.execute-api.ap-southeast-2.amazonaws.com','https://abc.execute-api.ap-northeast-1.amazonaws.com'])
    assert.throws(()=>validateConfig(endpoint,'client'));
});
