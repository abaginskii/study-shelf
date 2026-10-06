import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {aiQuota} from '../lib/ai';
import {AppError,getLibrary,mutateLibrary} from '../lib/storage';
import {AI_PERIOD_MS,PILOT_LIMITS} from '../lib/plans';

test('AI period allowance migrates old accounts, survives concurrency and resets only when expired',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'polka-quota-'));
 const names=['LOCAL_DATA_DIR','VERCEL','GOOGLE_GENERATIVE_AI_API_KEY'];const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 process.env.LOCAL_DATA_DIR=dir;delete process.env.VERCEL;process.env.GOOGLE_GENERATIVE_AI_API_KEY='test-key-no-provider-request';
 try{
  await aiQuota('user-a');const migrated=await getLibrary('user-a');assert.equal(migrated.aiPeriod?.count,1);assert.equal(migrated.aiUsage.count,1);assert.ok(migrated.aiPeriod?.startedAt);
  await mutateLibrary('user-a',lib=>{lib.aiUsage.count=0;lib.aiPeriod!.count=PILOT_LIMITS.aiPeriod-1});
  const attempts=await Promise.allSettled([aiQuota('user-a'),aiQuota('user-a')]);assert.equal(attempts.filter(result=>result.status==='fulfilled').length,1);
  const failure=attempts.find(result=>result.status==='rejected');assert.ok(failure?.status==='rejected'&&failure.reason instanceof AppError&&failure.reason.status===429);
  const full=await getLibrary('user-a');assert.equal(full.aiPeriod?.count,PILOT_LIMITS.aiPeriod);assert.equal(full.aiUsage.count,1);
  await assert.rejects(aiQuota('user-a'),error=>error instanceof AppError&&error.status===429);assert.equal((await getLibrary('user-a')).aiUsage.count,1);
  await mutateLibrary('user-a',lib=>{lib.aiPeriod!.startedAt=new Date(Date.now()-AI_PERIOD_MS-1000).toISOString()});
  await aiQuota('user-a');const renewed=await getLibrary('user-a');assert.equal(renewed.aiPeriod?.count,1);assert.equal(renewed.aiUsage.count,2);
  await aiQuota('user-b');assert.equal((await getLibrary('user-b')).aiPeriod?.count,1);assert.equal((await getLibrary('user-a')).aiPeriod?.count,1);
  await mutateLibrary('user-a',lib=>{lib.aiUsage.count=PILOT_LIMITS.aiDaily});await assert.rejects(aiQuota('user-a'),error=>error instanceof AppError&&error.status===429);assert.equal((await getLibrary('user-a')).aiPeriod?.count,1);
 }finally{
  await rm(dir,{recursive:true,force:true});for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name]}
 }
});
