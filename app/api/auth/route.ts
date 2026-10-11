import {randomBytes} from 'node:crypto';
import {AppError,readJSON,writeObject} from '@/lib/storage';
import {checkOrigin,consumeLimit,rateKey,usernamePath,hashPassword,verifyPassword,hashRecovery,setSession,publicUser} from '@/lib/auth';
import {startEmailChallenge,confirmEmailChallenge,findEmailAccount} from '@/lib/email-auth';
import {body,json,route} from '@/lib/http';
import type {User} from '@/lib/types';
export async function POST(request:Request){return route(async()=>{
 checkOrigin(request);if((process.env.AUTH_SECRET?.length||0)<32)throw new AppError('Вход ещё не настроен.',503);
 const input=await body(request);await consumeLimit('auth:'+rateKey(request),20,15*60000);
 if(input.action==='register'||input.action==='register-start'){await consumeLimit('register:'+rateKey(request),5,86400000);return json(await startEmailChallenge({email:input.email,password:input.password,displayName:input.displayName},'register'))}
 if(input.action==='register-confirm'){const result=await confirmEmailChallenge(String(input.challengeId||''),String(input.code||''),'register');await setSession(result.user);return json({user:publicUser(result.user),recoveryCode:result.recoveryCode},201)}
 const identifier=String(input.username||input.email||'').toLowerCase().trim();const password=String(input.password||'');
 if(password.length<10||password.length>128)throw new AppError('Пароль должен содержать от 10 до 128 символов.');
 const old=identifier.includes('@')?await findEmailAccount(identifier):/^[a-z0-9_\-.]{3,40}$/.test(identifier)?await readJSON<User>(usernamePath(identifier)):null;
 if(input.action==='recover'){if(!old||hashRecovery(String(input.recoveryCode||''))!==old.value.recoveryHash)throw new AppError('Почта, логин или код восстановления неверен.',403);const recoveryCode=randomBytes(24).toString('hex');const user={...old.value,passwordHash:hashPassword(password),recoveryHash:hashRecovery(recoveryCode),version:old.value.version+1};await writeObject(usernamePath(user.username),JSON.stringify(user),{etag:old.etag});await setSession(user);return json({user:publicUser(user),recoveryCode})}
 if(input.action!=='login'||!old||!verifyPassword(password,old.value.passwordHash)){verifyPassword(password,hashPassword('constant-dummy-password'));throw new AppError('Почта, логин или пароль неверен.',403)}await setSession(old.value);return json({user:publicUser(old.value)})
})}
