import {cookies} from 'next/headers';
import {timingSafeEqual} from 'node:crypto';
import {setSession} from '@/lib/auth';
import {exchangeCode,orvoRedirect,userForOrvo} from '@/lib/orvo';
import {AppError,saveOrvoPlan} from '@/lib/storage';

const back=(request:Request,query:string)=>Response.redirect(new URL('/?'+query,request.url),303);

export async function GET(request:Request){
 const url=new URL(request.url);const jar=await cookies();
 const expected=jar.get('polka_orvo_state')?.value||'';const state=url.searchParams.get('state')||'';const code=url.searchParams.get('code')||'';
 jar.delete({name:'polka_orvo_state',path:'/api/auth/orvo'});
 if(!code||!expected||expected.length!==state.length||!timingSafeEqual(Buffer.from(expected),Buffer.from(state)))return back(request,'orvo=expired');
 try{const profile=await exchangeCode(code,orvoRedirect(request));const user=await userForOrvo(profile);await saveOrvoPlan(user.id,profile.plan,profile.plan_until);await setSession(user);return back(request,'orvo=ok')}
 catch(error){console.error('orvo sign-in failed',error instanceof AppError?error.message:error instanceof Error?error.name:'unknown');return back(request,'orvo=failed')}
}
