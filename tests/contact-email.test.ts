import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {registerWithLogin,saveContactEmail} from '../lib/account-credentials';
import {readJSON,writeObject} from '../lib/storage';
import {usernamePath,verifyPassword} from '../lib/auth';
import {emailPath,findEmailAccount} from '../lib/email-auth';
import type {User} from '../lib/types';
test('contact email cannot claim identity; saving preserves login, password, session version and account ID',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'polka-contact-test-'));const saved={LOCAL_DATA_DIR:process.env.LOCAL_DATA_DIR,VERCEL:process.env.VERCEL};Object.assign(process.env,{LOCAL_DATA_DIR:dir,VERCEL:''});
 try{
  const input={username:'Learner',password:'fixture-password-123456'};
  const results=await Promise.allSettled([registerWithLogin(input),registerWithLogin(input)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  const user=(await readJSON<User>(usernamePath('learner')))!.value;assert.equal(user.username,'learner');assert.ok(verifyPassword(input.password,user.passwordHash));
  const contact=await saveContactEmail(user,'  CONTACT@Example.com ');assert.equal(contact.email,'contact@example.com');assert.equal(contact.emailVerifiedAt,undefined);for(const key of ['id','username','passwordHash','recoveryHash','version'] as const)assert.equal(contact[key],user[key]);assert.equal(await readJSON(emailPath(contact.email)),null);assert.equal(await findEmailAccount(contact.email),null);
  const other=(await registerWithLogin({username:'other',password:input.password})).user;
  await assert.rejects(saveContactEmail({...user,id:other.id},'other@example.com'));await assert.rejects(saveContactEmail(user,'invalid'));
  await saveContactEmail(other,contact.email);assert.equal(await findEmailAccount(contact.email),null);
  await writeObject(emailPath(contact.email),JSON.stringify({username:user.username,userId:user.id}),{createOnly:true});await writeObject(usernamePath(user.username),JSON.stringify({...contact,emailVerifiedAt:new Date().toISOString()}));
  await saveContactEmail(user,contact.email);assert.equal(await findEmailAccount(contact.email),null);
 }finally{for(const key of ['LOCAL_DATA_DIR','VERCEL'] as const){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}await rm(dir,{recursive:true,force:true})}
});
