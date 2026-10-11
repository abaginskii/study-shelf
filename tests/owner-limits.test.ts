import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {writeObject,getUserLimits,mutateLibrary,createChat,getLibrary} from '../lib/storage';
import {usernamePath} from '../lib/auth';
import {authorizeOwner} from '../lib/admin-auth';
import {PILOT_LIMITS,OWNER_LIMITS} from '../lib/plans';
import {aiQuota} from '../lib/ai';
import {requireUserStudyAccess} from '../lib/billing';
import {emptyLibrary,type User} from '../lib/types';

test('owner allowances require persisted artem identity and pinned UUID; storage and AI enforce effective limits',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'polka-owner-limits-'));
 const keys=['LOCAL_DATA_DIR','VERCEL','OWNER_USERNAME','OWNER_USER_ID','GOOGLE_GENERATIVE_AI_API_KEY'] as const;
 const before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 process.env.LOCAL_DATA_DIR=dir;delete process.env.VERCEL;delete process.env.OWNER_USER_ID;process.env.OWNER_USERNAME='artem';process.env.GOOGLE_GENERATIVE_AI_API_KEY='not-a-real-key';
 const owner:User={id:randomUUID(),username:'artem',createdAt:new Date().toISOString(),version:1,passwordHash:'test',recoveryHash:'test'};const other=randomUUID();
 try{
  await writeObject(usernamePath('artem'),JSON.stringify(owner));
  assert.equal(await getUserLimits(owner.id),PILOT_LIMITS,'a username alone never grants privileges');
  await authorizeOwner(owner);
  assert.equal(await getUserLimits(owner.id),OWNER_LIMITS);
  assert.equal(await getUserLimits(other),PILOT_LIMITS);
  process.env.OWNER_USER_ID=other;assert.equal(await getUserLimits(owner.id),PILOT_LIMITS);delete process.env.OWNER_USER_ID;
  const now=new Date().toISOString();
  for(const uid of [owner.id,other])await mutateLibrary(uid,lib=>{
   lib.chats=Array.from({length:PILOT_LIMITS.chats},()=>({id:randomUUID(),title:'Existing',updatedAt:now,materialIds:[]}));
   lib.aiUsage={day:now.slice(0,10),count:PILOT_LIMITS.aiDaily};lib.aiPeriod={startedAt:now,count:PILOT_LIMITS.aiPeriod};
  });
  await assert.rejects(createChat(other,'New',[]),/чатов/);await createChat(owner.id,'New',[]);
  await assert.rejects(aiQuota(other),/сегодня/);await aiQuota(owner.id);
  assert.equal((await getLibrary(owner.id)).aiUsage.count,PILOT_LIMITS.aiDaily+1);
  assert.equal((await getLibrary(owner.id)).chats!.length,PILOT_LIMITS.chats+1);
  const expired=emptyLibrary();expired.subscription={updatedAt:now,periods:[{orderId:randomUUID(),startsAt:'2020-01-01T00:00:00.000Z',endsAt:'2020-02-01T00:00:00.000Z',originalEndsAt:'2020-02-01T00:00:00.000Z',refundedRub:0}]};
  await assert.rejects(requireUserStudyAccess(other,expired),/завершён/);await requireUserStudyAccess(owner.id,expired);
  await writeObject(usernamePath('artem'),JSON.stringify({...owner,id:other}));
  assert.equal(await getUserLimits(other),PILOT_LIMITS,'recreating the same login cannot inherit pinned privileges');
  assert.equal(await getUserLimits(owner.id),PILOT_LIMITS);
 }finally{for(const key of keys){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key]}await rm(dir,{recursive:true,force:true})}
});
