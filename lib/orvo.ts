import {createHash,randomBytes} from 'node:crypto';
import {AppError,readJSON,writeObject} from './storage';
import {hashPassword,hashRecovery,usernamePath} from './auth';
import type {User} from './types';

// Sign in with orvo ID (https://github.com/abaginskii/orvo-id): redirect, one-time code, server-side exchange.
export const orvoConfig=()=>{
 const url=(process.env.ORVO_ID_URL||'').replace(/\/$/,'');const id=process.env.ORVO_CLIENT_ID||'polka';const secret=process.env.ORVO_CLIENT_SECRET||'';
 return {url,id,secret,ready:!!(url&&secret)};
};
export const orvoRedirect=(request:Request)=>`${(process.env.APP_URL||new URL(request.url).origin).replace(/\/$/,'')}/api/auth/orvo/callback`;
export const newState=()=>randomBytes(18).toString('base64url');

type OrvoProfile={sub:string;name:string;username:string;telegram_username?:string|null;avatar?:string};

export async function exchangeCode(code:string,redirectUri:string):Promise<OrvoProfile>{
 const c=orvoConfig();if(!c.ready)throw new AppError('Вход через orvo ID ещё не настроен.',503);
 const response=await fetch(`${c.url}/api/oauth/token`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:c.id,client_secret:c.secret,code,redirect_uri:redirectUri}),signal:AbortSignal.timeout(10000)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||!data.user?.sub)throw new AppError(data.error||'orvo ID не подтвердил вход.',502);
 return data.user;
}

const linkPath=(sub:string)=>`orvo-links/${createHash('sha256').update(sub).digest('hex')}.json`;

// Finds the Полка account tied to this orvo ID, or creates one. Created accounts have no usable password.
export async function userForOrvo(profile:OrvoProfile):Promise<User>{
 const link=await readJSON<{username:string;userId:string}>(linkPath(profile.sub));
 if(link){const account=await readJSON<User>(usernamePath(link.value.username));if(account&&account.value.id===link.value.userId)return account.value}
 const base=('orvo_'+profile.username).toLowerCase().replace(/[^a-z0-9_\-.]/g,'').slice(0,34);
 for(const candidate of [base,base+'_'+randomBytes(2).toString('hex'),base+'_'+randomBytes(3).toString('hex')]){
  const user:User={id:crypto.randomUUID(),username:candidate,displayName:String(profile.name||profile.username).slice(0,40),passwordHash:hashPassword(randomBytes(32).toString('hex')),recoveryHash:hashRecovery(randomBytes(24).toString('hex')),createdAt:new Date().toISOString(),version:1,orvoId:profile.sub};
  try{await writeObject(usernamePath(candidate),JSON.stringify(user),{createOnly:true})}catch(error){if(error instanceof AppError&&error.status===409)continue;throw error}
  await writeObject(linkPath(profile.sub),JSON.stringify({username:candidate,userId:user.id}));
  return user;
 }
 throw new AppError('Не удалось создать аккаунт. Попробуйте ещё раз.',409);
}
