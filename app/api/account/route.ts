import {requireUser} from '@/lib/auth';
import {getLibrary} from '@/lib/storage';
import {aiAvailable} from '@/lib/ai';
import {json,route} from '@/lib/http';
import {PILOT_LIMITS,AI_PERIOD_MS} from '@/lib/plans';
import type {AccountSummary} from '@/lib/types';
import {subscriptionAccess} from '@/lib/billing';
import {isOwner} from '@/lib/admin-auth';

export const dynamic='force-dynamic';
export async function GET(){return route(async()=>{
 const user=await requireUser();const library=await getLibrary(user.id);const now=new Date();
 const filesBytes=library.materials.reduce((sum,material)=>sum+(material.size||0),0);
 // All reservations count until upload cleanup removes them, matching enforcement.
 const reservedBytes=(library.uploads||[]).reduce((sum,upload)=>sum+upload.size,0);
 const aiUsed=library.aiUsage.day===now.toISOString().slice(0,10)?library.aiUsage.count:0;
 const access=subscriptionAccess(library);
 const periodStart=Date.parse(access.paid?access.startsAt||'':library.aiPeriod?.startedAt||'');
 const activePeriod=Number.isFinite(periodStart)&&periodStart<=now.getTime()&&periodStart+AI_PERIOD_MS>now.getTime();
 const periodUsed=activePeriod&&library.aiPeriod?.startedAt===new Date(periodStart).toISOString()?library.aiPeriod.count:0;
 const resetsAt=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1)).toISOString();
 const account:AccountSummary={
  user:{id:user.id,username:user.username,createdAt:user.createdAt},
  access,
  usage:{
   materials:{used:library.materials.length,limit:PILOT_LIMITS.materials},
   storage:{used:filesBytes+reservedBytes,limit:PILOT_LIMITS.storageBytes,filesBytes,reservedBytes},
   ai:{used:aiUsed,limit:PILOT_LIMITS.aiDaily,remaining:Math.max(0,PILOT_LIMITS.aiDaily-aiUsed),resetsAt,periodUsed,periodLimit:PILOT_LIMITS.aiPeriod,periodRemaining:Math.max(0,PILOT_LIMITS.aiPeriod-periodUsed),periodResetsAt:activePeriod?new Date(periodStart+AI_PERIOD_MS).toISOString():null},
   topics:{used:library.topics.length,limit:PILOT_LIMITS.topics},
   chats:{used:library.chats?.length||0,limit:PILOT_LIMITS.chats},
   reviews:{used:library.reviews},
  },
  limits:{uploadBytes:PILOT_LIMITS.uploadBytes,aiFileBytes:PILOT_LIMITS.aiFileBytes,chatQuestions:PILOT_LIMITS.chatQuestions,chatAnswers:PILOT_LIMITS.chatAnswers},
  aiAvailable:aiAvailable(),owner:await isOwner(),exportUrl:'/api/export',
 };
 return json(account);
})}
