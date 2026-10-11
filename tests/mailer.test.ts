import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emailConnectionHint} from '../lib/mailer';
test('SMTP diagnostics report known failure categories without exposing raw credentials or server replies',()=>{
 const auth=emailConnectionHint({code:'EAUTH',responseCode:535,response:'private-server-reply',message:'secret-password'});
 assert.match(auth,/535/);assert.ok(!auth.includes('private-server-reply')&&!auth.includes('secret-password'));
 const unknown=emailConnectionHint({code:'secret-password',responseCode:'secret-password',message:'secret-password'});assert.ok(!unknown.includes('secret-password'));
 assert.notEqual(emailConnectionHint({code:'ETIMEDOUT'}),unknown);
});
