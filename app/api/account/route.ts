import {requireUser} from '@/lib/auth';
import {getLibrary,getUserLimits} from '@/lib/storage';
import {aiAvailable} from '@/lib/ai';
import {json,route} from '@/lib/http';
import {OWNER_LIMITS,AI_PERIOD_MS} from '@/lib/plans';
import type {AccountSummary} from '@/lib/types';
import {subscriptionAccess} from '@/lib/billing';
import {isOwner} from '@/lib/admin-auth';

export const dynamic='force-dynamic';
export async function GET(){return route(async()=>{
 const user=await requireUser();const library=await getLibrary(user.id);const owner=await isOwner();const limits=await getUserLimits(user.id);const now=new Date();
 const filesBytes=library.materials.reduce((sum,material)=>sum+(material.size||0),0);
 // All reservations count until upload cleanup removes them, matching enforcement.
 const reservedBytes=(library.uploads||[]).reduce((sum,upload)=>sum+upload.size,0);
 const aiUsed=library.aiUsage.day===now.toISOString().slice(0,10)?library.aiUsage.count:0;
 const access:AccountSummary['access']=subscriptionAccess(library);
 if(limits===OWNER_LIMITS&&access.status==='expired'){access.status='active';access.kind='pilot';access.endsAt=undefined;access.startsAt=undefined;}
 const periodStart=Date.parse(access.paid?access.startsAt||'':library.aiPeriod?.startedAt||'');
 const activePeriod=Number.isFinite(periodStart)&&periodStart<=now.getTime()&&periodStart+AI_PERIOD_MS>now.getTime();
 const periodUsed=activePeriod&&library.aiPeriod?.startedAt===new Date(periodStart).toISOString()?library.aiPeriod.count:0;
 const resetsAt=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1)).toISOString();
 const account:AccountSummary={
  user:{id:user.id,username:user.username,createdAt:user.createdAt,email:user.email,displayName:user.displayName},
  access,
  usage:{
   materials:{used:library.materials.length,limit:limits.materials},
   storage:{used:filesBytes+reservedBytes,limit:limits.storageBytes,filesBytes,reservedBytes},
   ai:{used:aiUsed,limit:limits.aiDaily,remaining:Math.max(0,limits.aiDaily-aiUsed),resetsAt,periodUsed,periodLimit:limits.aiPeriod,periodRemaining:Math.max(0,limits.aiPeriod-periodUsed),periodResetsAt:activePeriod?new Date(periodStart+AI_PERIOD_MS).toISOString():null},
   topics:{used:library.topics.length,limit:limits.topics},
   chats:{used:library.chats?.length||0,limit:limits.chats},
   reviews:{used:library.reviews},
  },
  limits:{uploadBytes:limits.uploadBytes,aiFileBytes:limits.aiFileBytes,chatQuestions:limits.chatQuestions,chatAnswers:limits.chatAnswers},
  aiAvailable:aiAvailable(),owner,exportUrl:'/api/export',
 };
 return json(account);
})}
