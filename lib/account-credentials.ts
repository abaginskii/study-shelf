import {randomBytes,randomUUID} from 'node:crypto';
import {AppError,readJSON,writeObject} from './storage';
import {hashPassword,hashRecovery,usernamePath} from './auth';
import {normalizeEmail} from './email-auth';
import type {User} from './types';
export async function registerWithLogin(input:{username:unknown;password:unknown;displayName?:unknown}){
 const username=String(input.username||'').trim().toLowerCase();const password=String(input.password||'');
 if(!/^[a-z0-9_\-.]{3,40}$/.test(username))throw new AppError('Логин: 3–40 латинских букв, цифр или символов _ . -');
 if(password.length<10||password.length>128)throw new AppError('Пароль должен содержать от 10 до 128 символов.');
 const recoveryCode=randomBytes(24).toString('hex');
 const user:User={id:randomUUID(),username,displayName:String(input.displayName||'').trim().slice(0,40)||username,passwordHash:hashPassword(password),recoveryHash:hashRecovery(recoveryCode),createdAt:new Date().toISOString(),version:1};
 try{await writeObject(usernamePath(username),JSON.stringify(user),{createOnly:true})}catch(error){if(error instanceof AppError&&error.status===409)throw new AppError('Этот логин уже занят.',409);throw error}
 return {user,recoveryCode};
}
// Contact only: never reserve an email identity or grant authentication by this address.
export async function saveContactEmail(actor:User,value:unknown){
 const email=normalizeEmail(value);const stored=await readJSON<User>(usernamePath(actor.username));
 if(!stored||stored.value.id!==actor.id||stored.value.version!==actor.version)throw new AppError('Войдите в аккаунт заново.',401);
 const user={...stored.value,email};delete user.emailVerifiedAt;
 await writeObject(usernamePath(actor.username),JSON.stringify(user),{etag:stored.etag});return user;
}
