import {checkOrigin,consumeLimit,rateKey,requireUser,publicUser} from '@/lib/auth';
import {saveContactEmail} from '@/lib/account-credentials';
import {AppError} from '@/lib/storage';
import {body,json,route} from '@/lib/http';
export async function POST(request:Request){return route(async()=>{
 checkOrigin(request);const user=await requireUser();await consumeLimit('contact-email:'+user.id+':'+rateKey(request),15,3600000);const input=await body(request);
 if(input.action!=='save')throw new AppError('Подтверждение по почте пока отключено. Обновите страницу.',400);
 return json({user:publicUser(await saveContactEmail(user,input.email))});
})}
