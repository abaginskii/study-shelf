import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {authorizeOwner} from '../lib/admin-auth';
import {ownerOverview,ownerDetail,ownerContent} from '../lib/admin-data';
import {writeObject,listObjects,readJSON,userPath} from '../lib/storage';
import {usernamePath} from '../lib/auth';
import {emptyLibrary,type User,type Material,type Chat} from '../lib/types';

async function fixture(fn:(dir:string)=>Promise<void>){const dir=await mkdtemp(join(tmpdir(),'polka-admin-'));const vars=['LOCAL_DATA_DIR','VERCEL','OWNER_USER_ID','OWNER_USERNAME'] as const;const before=Object.fromEntries(vars.map(key=>[key,process.env[key]]));process.env.LOCAL_DATA_DIR=dir;for(const key of vars.slice(1))delete process.env[key];try{await fn(dir)}finally{for(const key of vars){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key]}await rm(dir,{recursive:true,force:true})}}
const user=(username='artem'):User=>({id:randomUUID(),username,createdAt:new Date().toISOString(),version:1,passwordHash:'private-password-hash',recoveryHash:'private-recovery-hash'});

test('owner access fails closed and pins the authenticated existing account ID once',async()=>fixture(async()=>{
 const owner=user();const other=user('ordinary');
 await assert.rejects(authorizeOwner(null),error=>(error as {status:number}).status===401);
 await assert.rejects(authorizeOwner(owner),error=>(error as {status:number}).status===403);
 process.env.OWNER_USERNAME='artem';await assert.rejects(authorizeOwner(other));
 assert.equal((await authorizeOwner(owner)).id,owner.id);assert.equal((await readJSON<{id:string}>('operations/owner.json'))?.value.id,owner.id);
 const reused=user();await assert.rejects(authorizeOwner(reused),error=>(error as {status:number}).status===403);
 // A deliberate server UUID override is authoritative; no client input can perform it.
 process.env.OWNER_USER_ID=other.id;await assert.rejects(authorizeOwner(owner));assert.equal((await authorizeOwner(other)).id,other.id);
}));
test('owner metrics reconcile with libraries and exports omit account secrets and original file paths',async()=>fixture(async()=>{
 const account=user();const second=user('second');const library=emptyLibrary();const now=new Date().toISOString();
 const material:Material={id:randomUUID(),title:'Fixture lecture',subject:'',kind:'pdf',createdAt:now,updatedAt:now,status:'ready',excerpt:'source',hasFile:true,size:1234,revision:1,text:'source',summary:'summary',terms:[],questions:[],sourceVersion:1,summaryVersion:1,filePath:`${userPath(account.id)}/files/original.pdf`};
 const {text:_,summary:__,terms:___,questions:____,sourceVersion:_____,summaryVersion:______,filePath:_______,...card}=material;
 const chat:Chat={id:randomUUID(),title:'Saved chat',updatedAt:now,materialIds:[material.id],messages:[],status:'failed',error:'Fixture error',revision:1};
 library.materials=[card];library.chats=[{id:chat.id,title:chat.title,updatedAt:now,materialIds:chat.materialIds}];library.reviews=2;library.aiUsage={day:now.slice(0,10),count:3};library.uploads=[{pathname:'reserved',size:50,createdAt:Date.now()}];
 await writeObject(usernamePath(account.username),JSON.stringify(account));await writeObject(usernamePath(second.username),JSON.stringify(second));await writeObject(`${userPath(account.id)}/library.json`,JSON.stringify(library));await writeObject(`${userPath(account.id)}/materials/${material.id}.json`,JSON.stringify(material));await writeObject(`${userPath(account.id)}/chats/${chat.id}.json`,JSON.stringify(chat));
 const result=await ownerOverview();assert.equal(result.complete,true);assert.equal(result.totals.users,2);assert.equal(result.totals.materials,1);assert.equal(result.totals.ready,1);assert.equal(result.totals.chats,1);assert.equal(result.totals.fileBytes,1234);assert.equal(result.totals.reservedBytes,50);assert.equal(result.totals.aiToday,3);assert.equal(result.registrations.at(-1)?.count,2);assert.equal(result.kinds[0].kind,'pdf');
 const detail=await ownerDetail(account.id);const full=await ownerContent(account.id,'material',material.id);const serialized=JSON.stringify({result,detail,full});assert.ok(!serialized.includes('private-password-hash'));assert.ok(!serialized.includes('private-recovery-hash'));assert.ok(!serialized.includes('filePath'));assert.equal(full.kind,'material');if(full.kind==='material')assert.equal(full.content.summary,'summary');
 await assert.rejects(ownerContent(second.id,'material',material.id),error=>(error as {status:number}).status===404);
 await assert.rejects(ownerContent(account.id,'material','../../accounts'));
}));
test('storage inventory paginates metadata and rejects traversal',async()=>fixture(async()=>{
 await writeObject('users/a/one.json','one');await writeObject('users/a/two.json','second');await writeObject('accounts/record.json','secret content');
 const one=await listObjects('users/',1);assert.equal(one.objects.length,1);assert.equal(one.hasMore,true);assert.ok(one.cursor);assert.equal(one.objects[0].size,3);assert.ok(!JSON.stringify(one).includes('secret content'));
 const two=await listObjects('users/',1,one.cursor);assert.equal(two.objects.length,1);assert.equal(two.hasMore,false);assert.notEqual(two.objects[0].pathname,one.objects[0].pathname);await assert.rejects(listObjects('../',1));await assert.rejects(listObjects('users/',1,'-1'));
}));
