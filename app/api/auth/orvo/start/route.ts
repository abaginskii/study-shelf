import {cookies} from 'next/headers';
import {newState,orvoConfig,orvoRedirect} from '@/lib/orvo';

export async function GET(request:Request){
 const c=orvoConfig();
 if(!c.ready)return Response.redirect(new URL('/?orvo=off',request.url),303);
 const state=newState();
 // Lax: the cookie must come back when orvo ID redirects to the callback.
 (await cookies()).set('polka_orvo_state',state,{httpOnly:true,secure:process.env.NODE_ENV==='production'||!!process.env.VERCEL,sameSite:'lax',path:'/api/auth/orvo',maxAge:600});
 const target=new URL(`${c.url}/authorize`);
 target.searchParams.set('client_id',c.id);target.searchParams.set('redirect_uri',orvoRedirect(request));target.searchParams.set('state',state);
 return Response.redirect(target,303);
}
