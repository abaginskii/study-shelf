import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emailConnectionHint,emailReady,mailDelivery,verifyEmailConnection} from '../lib/mailer';
test('SMTP diagnostics report known failure categories without exposing raw credentials or server replies',()=>{
 const auth=emailConnectionHint({code:'EAUTH',responseCode:535,response:'private-server-reply',message:'secret-password'});
 assert.match(auth,/535/);assert.ok(!auth.includes('private-server-reply')&&!auth.includes('secret-password'));
 const unknown=emailConnectionHint({code:'secret-password',responseCode:'secret-password',message:'secret-password'});assert.ok(!unknown.includes('secret-password'));
 assert.notEqual(emailConnectionHint({code:'ETIMEDOUT'}),unknown);
});
test('HTTPS verification mail requires provider acceptance and verified sender, never falls back to SMTP',async()=>{
 const keys=['MAIL_PROVIDER','BREVO_API_KEY','MAIL_FROM','SMTP_PASSWORD'];const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));const fetchOriginal=globalThis.fetch;
 try{
  Object.assign(process.env,{MAIL_PROVIDER:'brevo',MAIL_FROM:'sender@example.com',SMTP_PASSWORD:'unused-test-smtp'});delete process.env.BREVO_API_KEY;
  assert.equal(emailReady(),false);
  await assert.rejects(mailDelivery.send('recipient@example.com','123456'));
  process.env.BREVO_API_KEY='fixture-only-api-key';assert.equal(emailReady(),true);
  let mode='accepted';let calls=0;
  globalThis.fetch=async(input,init)=>{
   calls++;assert.equal(new Headers(init?.headers).get('api-key'),'fixture-only-api-key');assert.equal(init?.redirect,'error');assert.ok(init?.signal);
   const body=init?.body?JSON.parse(String(init.body)):{};
   if(String(input).endsWith('/senders')){
    assert.equal(init?.method,'GET');assert.equal(init?.body,undefined);
    return Response.json({senders:[{email:'sender@example.com',active:mode==='accepted'}]});
   }
   assert.equal(String(input),'https://api.brevo.com/v3/smtp/email');assert.deepEqual(body.to,[{email:'recipient@example.com'}]);assert.equal(body.sender.email,'sender@example.com');assert.equal(body.replyTo.email,'sender@example.com');assert.match(body.textContent,/123456/);assert.equal(body.api_key,undefined);
   if(mode==='network')throw new Error('private-response recipient@example.com fixture-only-api-key');
   if(mode==='quota')return Response.json({error:'private'}, {status:429});
   return Response.json(mode==='accepted'?{messageId:'test-message-id'}:mode==='partial'?{messageId:''}:{code:'private-response',message:'fixture-only-api-key'});
  };
  await verifyEmailConnection();assert.equal(calls,1);await mailDelivery.send('recipient@example.com','123456');
  mode='unverified';await assert.rejects(verifyEmailConnection(),error=>emailConnectionHint(error).includes('Senders, Domains, IPs'));
  for(mode of ['partial','error','quota','network'])await assert.rejects(mailDelivery.send('recipient@example.com','123456'),error=>{assert.ok(!String(error).includes('fixture-only-api-key'));assert.ok(!String(error).includes('recipient@example.com'));return true});
 }finally{globalThis.fetch=fetchOriginal;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}}
});
