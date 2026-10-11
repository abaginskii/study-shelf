import {createHash,createHmac,randomInt,randomUUID,randomBytes,timingSafeEqual} from 'node:crypto';
import {AppError,readJSON,writeObject} from './storage';
import {usernamePath,hashPassword,hashRecovery,verifyPassword,consumeLimit} from './auth';
import {emailReady,mailDelivery} from './mailer';
import type {User} from './types';
type EmailIndex={username:string;userId:string};
type Challenge={email:string;purpose:'register'|'link';user:User;hash:string;expires:number;attempts:number;used:boolean};
export function normalizeEmail(value:unknown){const email=String(value||'').trim().toLowerCase();if(email.length>254||! /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))throw new AppError('Укажите корректный email.');return email}
export const emailPath=(email:string)=>`emails/${createHash('sha256').update(normalizeEmail(email)).digest('hex')}.json`;
const challengePath=(id:string)=>{if(!/^[0-9a-f-]{36}$/.test(id))throw new AppError('Запрос подтверждения не найден.',400);return `email-challenges/${id}.json`};
const digest=(id:string,code:string)=>{if((process.env.AUTH_SECRET?.length||0)<32)throw new AppError('Вход ещё не настроен.',503);return createHmac('sha256',process.env.AUTH_SECRET!).update(id+':'+code).digest('hex')};
export async function findEmailAccount(email:string){const index=await readJSON<EmailIndex>(emailPath(email));if(!index)return null;const account=await readJSON<User>(usernamePath(index.value.username));return account?.value.id===index.value.userId&&account.value.email===normalizeEmail(email)&&account.value.emailVerifiedAt?account:null}
export async function startEmailChallenge(input:{email:unknown;password:unknown;displayName?:unknown},purpose:'register'|'link',actor?:User){
 if(!emailReady())throw new AppError('Регистрация по почте ещё настраивается. Вход в существующий аккаунт доступен.',503);
 const email=normalizeEmail(input.email);const password=String(input.password||'');if(password.length<10||password.length>128)throw new AppError('Пароль: от 10 до 128 символов.');
 if(purpose==='link'&&(!actor||!verifyPassword(password,actor.passwordHash)))throw new AppError('Пароль аккаунта неверен.',403);
 if(purpose==='link'&&actor?.emailVerifiedAt)throw new AppError('Почта уже привязана к аккаунту.',409);
 if(await readJSON(emailPath(email)))throw new AppError('Этот email уже связан с аккаунтом. Войдите с ним.',409);
 await consumeLimit('email-send:'+email,5,3600000);
 const id=randomUUID();const code=String(randomInt(100000,1000000));
 const uid=randomUUID();const displayName=String(input.displayName||'').trim().slice(0,40)||email.split('@')[0].slice(0,40);
 const user:User=actor||{id:uid,username:'u_'+uid.replaceAll('-','').slice(0,24),displayName,passwordHash:hashPassword(password),recoveryHash:'',createdAt:new Date().toISOString(),version:1};
 const challenge:Challenge={email,purpose,user,hash:digest(id,code),expires:Date.now()+600000,attempts:0,used:false};
 await writeObject(challengePath(id),JSON.stringify(challenge),{createOnly:true});await mailDelivery.send(email,code);return {challengeId:id,email,expiresIn:600};
}
export async function confirmEmailChallenge(id:string,code:string,purpose:'register'|'link',actor?:User){
 const path=challengePath(id);const old=await readJSON<Challenge>(path);const value=old?.value;
 if(!old||!value||value.purpose!==purpose||value.used||value.expires<Date.now()||value.attempts>=5)throw new AppError('Код истёк или уже использован. Запросите новый.',400);
 if(purpose==='link'&&actor?.id!==value.user.id)throw new AppError('Этот код относится к другому аккаунту.',403);
 const actual=Buffer.from(digest(id,code),'hex');const expected=Buffer.from(value.hash,'hex');const valid=actual.length===expected.length&&timingSafeEqual(actual,expected);
 await writeObject(path,JSON.stringify({...value,attempts:value.attempts+1,used:valid}),{etag:old.etag});
 if(!valid)throw new AppError('Неверный код подтверждения.',400);
 try{
  const indexPath=emailPath(value.email);const index=await readJSON<EmailIndex>(indexPath);
  if(index&&index.value.userId!==value.user.id)throw new AppError('Этот email уже связан с другим аккаунтом.',409);
  if(!index)await writeObject(indexPath,JSON.stringify({username:value.user.username,userId:value.user.id}),{createOnly:true});
  const stored=await readJSON<User>(usernamePath(value.user.username));
  if(stored&&stored.value.id!==value.user.id)throw new AppError('Аккаунт изменился. Повторите действие.',409);
  if(purpose==='link'&&(!stored||stored.value.emailVerifiedAt))throw new AppError('Почта аккаунта уже изменена.',409);
  const recoveryCode=purpose==='register'?randomBytes(24).toString('hex'):undefined;
  const user:User={...(stored?.value||value.user),email:value.email,emailVerifiedAt:new Date().toISOString(),...(recoveryCode?{recoveryHash:hashRecovery(recoveryCode)}:{})};
  await writeObject(usernamePath(user.username),JSON.stringify(user),stored?{etag:stored.etag}:{createOnly:true});
  return {user,recoveryCode};
 }catch(error){
  // Retry a partially completed multi-object write with the same reserved identity.
  const latest=await readJSON<Challenge>(path);if(latest?.value.used)await writeObject(path,JSON.stringify({...latest.value,used:false}),{etag:latest.etag}).catch(()=>{});
  throw error;
 }
}
