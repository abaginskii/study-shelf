import {randomBytes} from 'node:crypto';
import {AppError,readJSON,writeObject} from '@/lib/storage';
import {checkOrigin,consumeLimit,rateKey,usernamePath,hashPassword,verifyPassword,hashRecovery,setSession,publicUser} from '@/lib/auth';
import {registerWithLogin} from '@/lib/account-credentials';
import {body,json,route} from '@/lib/http';
import type {User} from '@/lib/types';
export async function POST(request:Request){return route(async()=>{
 checkOrigin(request);if((process.env.AUTH_SECRET?.length||0)<32)throw new AppError('Вход ещё не настроен.',503);
 const input=await body(request);await consumeLimit('auth:'+rateKey(request),20,15*60000);
 if(input.action==='register'){await consumeLimit('register:'+rateKey(request),5,86400000);if(input.adult!==true&&input.adult!=='on')throw new AppError('Подтвердите возраст и принятие условий.');const result=await registerWithLogin(input);await setSession(result.user);return json({user:publicUser(result.user),recoveryCode:result.recoveryCode},201)}
 if(input.action!=='login'&&input.action!=='recover')throw new AppError('Вход и регистрация по почте пока отключены.',400);
 const identifier=String(input.username||'').toLowerCase().trim();const password=String(input.password||'');
 if(password.length<10||password.length>128)throw new AppError('Пароль должен содержать от 10 до 128 символов.');
 const old=/^[a-z0-9_\-.]{3,40}$/.test(identifier)?await readJSON<User>(usernamePath(identifier)):null;
 if(input.action==='recover'){if(!old||hashRecovery(String(input.recoveryCode||''))!==old.value.recoveryHash)throw new AppError('Логин или код восстановления неверен.',403);const recoveryCode=randomBytes(24).toString('hex');const user={...old.value,passwordHash:hashPassword(password),recoveryHash:hashRecovery(recoveryCode),version:old.value.version+1};await writeObject(usernamePath(user.username),JSON.stringify(user),{etag:old.etag});await setSession(user);return json({user:publicUser(user),recoveryCode})}
 if(input.action!=='login'||!old||!verifyPassword(password,old.value.passwordHash)){verifyPassword(password,hashPassword('constant-dummy-password'));throw new AppError('Логин или пароль неверен.',403)}await setSession(old.value);return json({user:publicUser(old.value)})
})}
