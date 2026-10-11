import {checkOrigin,consumeLimit,rateKey,requireUser,publicUser,setSession} from '@/lib/auth';
import {startEmailChallenge,confirmEmailChallenge} from '@/lib/email-auth';
import {AppError} from '@/lib/storage';
import {body,json,route} from '@/lib/http';
export async function POST(request:Request){return route(async()=>{checkOrigin(request);const user=await requireUser();await consumeLimit('email-link:'+user.id+':'+rateKey(request),15,3600000);const input=await body(request);if(input.action==='start')return json(await startEmailChallenge({email:input.email,password:input.password},'link',user));if(input.action!=='confirm')throw new AppError('Неизвестное действие.');const result=await confirmEmailChallenge(String(input.challengeId||''),String(input.code||''),'link',user);await setSession(result.user);return json({user:publicUser(result.user)})})}
