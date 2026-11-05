import {createHmac,timingSafeEqual} from 'node:crypto';
import {linkPath,orvoConfig} from '@/lib/orvo';
import {readJSON,saveOrvoPlan} from '@/lib/storage';

// orvo ID calls this when someone's orvo plus or premium changes. Signed with our client secret.
export async function POST(request:Request){
 const {secret}=orvoConfig();const raw=await request.text();
 const ts=request.headers.get('x-orvo-timestamp')||'';const sig=request.headers.get('x-orvo-signature')||'';
 const expected=createHmac('sha256',secret||'-').update(`${ts}.${raw}`).digest('hex');
 const ok=!!secret&&sig.length===expected.length&&timingSafeEqual(Buffer.from(sig),Buffer.from(expected))&&Math.abs(Date.now()/1000-Number(ts))<=300;
 if(!ok)return Response.json({ok:false},{status:401});
 let event:{type?:string;sub?:string;plan?:string;until?:number|null};
 try{event=JSON.parse(raw)}catch{return Response.json({ok:false},{status:400})}
 if(event.type==='plan'&&typeof event.sub==='string'){
  const link=await readJSON<{userId:string}>(linkPath(event.sub));
  if(link)await saveOrvoPlan(link.value.userId,event.plan,event.until??null);
 }
 return Response.json({ok:true});
}
