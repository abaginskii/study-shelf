import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {mailDelivery} from '../lib/mailer';
import {startEmailChallenge,confirmEmailChallenge,findEmailAccount} from '../lib/email-auth';
import {hashPassword,usernamePath} from '../lib/auth';
import {getLibrary,mutateLibrary,readJSON,writeObject} from '../lib/storage';
import {changeSubject,resolveSubjectName,subjectFolders} from '../lib/subjects';
import type {User,MaterialCard} from '../lib/types';
async function fixture(fn:()=>Promise<void>){
 const dir=await mkdtemp(join(tmpdir(),'polka-email-test-'));const keys=['LOCAL_DATA_DIR','VERCEL','AUTH_SECRET','SMTP_PASSWORD','MAIL_PROVIDER','SMTP2GO_API_KEY'];const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 process.env.MAIL_PROVIDER='smtp';delete process.env.SMTP2GO_API_KEY;
 Object.assign(process.env,{LOCAL_DATA_DIR:dir,VERCEL:'',AUTH_SECRET:'isolated-email-fixture-secret-123456789',SMTP_PASSWORD:'fixture-only'});const send=mailDelivery.send;
 try{await fn()}finally{mailDelivery.send=send;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}await rm(dir,{recursive:true,force:true})}
}
const password='fixture-password-123456';
test('concurrent email claims cannot overwrite another identity',()=>fixture(async()=>{
 const codes:string[]=[];mailDelivery.send=async(_email,value)=>{codes.push(value)};
 const first=await startEmailChallenge({email:'race@example.com',password},'register');
 const second=await startEmailChallenge({email:'race@example.com',password,displayName:'Other'},'register');
 const outcomes=await Promise.allSettled([confirmEmailChallenge(first.challengeId,codes[0],'register'),confirmEmailChallenge(second.challengeId,codes[1],'register')]);
 assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);
 const winner=outcomes.find(result=>result.status==='fulfilled');assert.equal((await findEmailAccount('race@example.com'))?.value.id,winner?.status==='fulfilled'?winner.value.user.id:undefined);
}));
test('missing SMTP cannot create an unverified account or send a code',()=>fixture(async()=>{
 delete process.env.SMTP_PASSWORD;let sent=false;mailDelivery.send=async()=>{sent=true};await assert.rejects(startEmailChallenge({email:'offline@example.com',password},'register'));assert.equal(sent,false);assert.equal(await findEmailAccount('offline@example.com'),null);
}));
test('email registration requires valid code, normalizes identity, and rejects replay and duplicate email',()=>fixture(async()=>{
 let code='';mailDelivery.send=async(_email,value)=>{code=value};
 const challenge=await startEmailChallenge({email:' Learner@Example.com ',password,displayName:'Learner'},'register');
 assert.equal(await findEmailAccount(challenge.email),null);
 await assert.rejects(confirmEmailChallenge(challenge.challengeId,'000000','register'));
 const result=await confirmEmailChallenge(challenge.challengeId,code,'register');assert.equal(result.user.email,'learner@example.com');assert.equal(result.user.displayName,'Learner');assert.ok(result.recoveryCode);assert.equal((await findEmailAccount('LEARNER@example.com'))?.value.id,result.user.id);
 await assert.rejects(confirmEmailChallenge(challenge.challengeId,code,'register'));
 await assert.rejects(startEmailChallenge({email:challenge.email,password},'register'));
}));
test('email linking preserves account and library, requires password and rejects foreign confirmation',()=>fixture(async()=>{
 const user:User={id:randomUUID(),username:'artem',passwordHash:hashPassword(password),recoveryHash:'existing',createdAt:new Date().toISOString(),version:1};await writeObject(usernamePath(user.username),JSON.stringify(user),{createOnly:true});await mutateLibrary(user.id,library=>{library.reviews=42});let code='';mailDelivery.send=async(_email,value)=>{code=value};
 await assert.rejects(startEmailChallenge({email:'owner@example.com',password:'wrong-password'},'link',user));
 const challenge=await startEmailChallenge({email:'owner@example.com',password},'link',user);
 await assert.rejects(confirmEmailChallenge(challenge.challengeId,code,'link',{...user,id:randomUUID()}));
 const result=await confirmEmailChallenge(challenge.challengeId,code,'link',user);assert.equal(result.user.id,user.id);assert.equal(result.user.username,'artem');assert.equal(result.user.passwordHash,user.passwordHash);assert.equal(result.user.recoveryHash,'existing');assert.equal((await getLibrary(user.id)).reviews,42);assert.equal((await findEmailAccount('owner@example.com'))?.value.id,user.id);
}));
test('wrong codes are bounded and expired challenges cannot create an account',()=>fixture(async()=>{
 let code='';mailDelivery.send=async(_email,value)=>{code=value};const first=await startEmailChallenge({email:'tries@example.com',password},'register');for(let i=0;i<5;i++)await assert.rejects(confirmEmailChallenge(first.challengeId,'000000','register'));await assert.rejects(confirmEmailChallenge(first.challengeId,code,'register'));
 const second=await startEmailChallenge({email:'expiry@example.com',password},'register');const path=`email-challenges/${second.challengeId}.json`;const item=await readJSON<Record<string,unknown>>(path);await writeObject(path,JSON.stringify({...item!.value,expires:0}),{etag:item!.etag});await assert.rejects(confirmEmailChallenge(second.challengeId,code,'register'));assert.equal(await findEmailAccount('expiry@example.com'),null);
}));
test('folder rename preserves source metadata, uses aliases, validates settings and isolates libraries',()=>fixture(async()=>{
 const uid=randomUUID();await mutateLibrary(uid,library=>{library.materials=[{id:randomUUID(),title:'Lecture',subject:'Math',revision:4} as MaterialCard]});const before=await getLibrary(uid);const folder=subjectFolders(before)[0];await changeSubject(uid,{id:folder.id,name:'Advanced Math',color:'mint',icon:'math'});const after=await getLibrary(uid);assert.deepEqual(after.materials,before.materials);assert.equal(resolveSubjectName(after,'Math'),'Advanced Math');assert.equal(subjectFolders(after).length,1);assert.equal(subjectFolders(await getLibrary(randomUUID())).length,0);await changeSubject(uid,{name:'History',color:'amber',icon:'globe'},true);assert.equal(subjectFolders(await getLibrary(uid)).length,2);await assert.rejects(changeSubject(uid,{name:'Math',color:'blue',icon:'book'},true));await assert.rejects(changeSubject(uid,{id:folder.id,name:'Math',color:'url(javascript)',icon:'book'}));
}));
