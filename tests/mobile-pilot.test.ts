import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mobilePilotEligible} from '../lib/mobile-pilot';
import {readJSON} from '../lib/storage';
import type {User} from '../lib/types';

const account=(username='artem'):User=>({id:randomUUID(),username,createdAt:new Date().toISOString(),version:1,passwordHash:'fixture-password-hash',recoveryHash:'fixture-recovery-hash'});

async function fixture(fn:(dir:string)=>Promise<void>){
 const dir=await mkdtemp(join(tmpdir(),'polka-mobile-pilot-'));
 const vars=['LOCAL_DATA_DIR','VERCEL','OWNER_USER_ID','OWNER_USERNAME','BLOB_READ_WRITE_TOKEN','BLOB_STORE_ID'] as const;
 const before=Object.fromEntries(vars.map(key=>[key,process.env[key]]));
 for(const key of vars)delete process.env[key];
 process.env.LOCAL_DATA_DIR=dir;
 try{await fn(dir)}finally{
  for(const key of vars){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key]}
  await rm(dir,{recursive:true,force:true});
 }
}

test('mobile pilot rejects anonymous and other usernames without enrolling an owner',async()=>fixture(async()=>{
 process.env.OWNER_USERNAME='artem';
 assert.equal(await mobilePilotEligible(null),false);
 assert.equal(await mobilePilotEligible(account('student')),false);
 assert.equal(await mobilePilotEligible(account('Artem')),false);
 assert.equal(await readJSON('operations/owner.json'),null);
}));

test('mobile pilot fails closed when owner configuration is unavailable',async()=>fixture(async()=>{
 assert.equal(await mobilePilotEligible(account()),false);
 assert.equal(await readJSON('operations/owner.json'),null);
}));

test('mobile pilot accepts the authenticated artem owner and rejects reuse of that username',async()=>fixture(async()=>{
 const owner=account();
 process.env.OWNER_USERNAME='artem';
 assert.equal(await mobilePilotEligible(owner),true);
 assert.equal((await readJSON<{id:string}>('operations/owner.json'))?.value.id,owner.id);
 assert.equal(await mobilePilotEligible({...owner,id:randomUUID()}),false);
 assert.equal(await mobilePilotEligible(owner),true);
}));

test('mobile pilot requires both the artem username and the configured owner UUID',async()=>fixture(async()=>{
 const owner=account();
 process.env.OWNER_USER_ID=owner.id;
 assert.equal(await mobilePilotEligible(owner),true);
 assert.equal(await mobilePilotEligible(account()),false);
 assert.equal(await mobilePilotEligible({...owner,username:'other'}),false);
 assert.equal(await readJSON('operations/owner.json'),null);
}));

test('mobile pilot fails closed on owner storage errors',async()=>fixture(async dir=>{
 const blocked=join(dir,'not-a-directory');
 await writeFile(blocked,'fixture');
 process.env.LOCAL_DATA_DIR=blocked;
 process.env.OWNER_USERNAME='artem';
 assert.equal(await mobilePilotEligible(account()),false);
}));
