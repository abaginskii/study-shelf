import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readObject,writeObject,AppError,saveMaterial,getMaterial,applyMaterialResult,createChat,getChat,beginChatTurn,finishChatTurn,deleteChat} from '../lib/storage';
import {streamChatAnswer,verifiedChatAnswer} from '../lib/ai';
import type {Material} from '../lib/types';

test('private Blob JSON uses the strong identity validator and stale CAS still fails',async()=>{
 const names=['LOCAL_DATA_DIR','VERCEL','BLOB_READ_WRITE_TOKEN','BLOB_STORE_ID','VERCEL_OIDC_TOKEN'];
 const old=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 const require=createRequire(import.meta.url);const {MockAgent,setGlobalDispatcher,getGlobalDispatcher}=createRequire(require.resolve('@vercel/blob'))('undici');const dispatcher=getGlobalDispatcher();const mock=new MockAgent();mock.disableNetConnect();setGlobalDispatcher(mock);
 delete process.env.LOCAL_DATA_DIR;delete process.env.VERCEL_OIDC_TOKEN;process.env.BLOB_READ_WRITE_TOKEN='vercel_blob_rw_teststore_mock';process.env.BLOB_STORE_ID='teststore';
 mock.get('https://teststore.private.blob.vercel-storage.com').intercept({method:'GET',path:'/test.json?cache=0',headers:{'accept-encoding':'identity'}}).reply(200,{text:'source'},{headers:{etag:'"original-v1"'}});
 const blob={url:'https://teststore.private.blob.vercel-storage.com/test.json',downloadUrl:'https://teststore.private.blob.vercel-storage.com/test.json',pathname:'test.json',contentType:'application/json',contentDisposition:'',etag:'"original-v2"'};
 mock.get('https://vercel.com').intercept({method:'PUT',path:'/api/blob/?pathname=test.json',headers:{'x-if-match':'"original-v1"'}}).reply(200,blob);
 mock.get('https://vercel.com').intercept({method:'PUT',path:'/api/blob/?pathname=test.json',headers:{'x-if-match':'"original-v1"'}}).reply(412,{error:{code:'precondition_failed'}});
 try{const value=await readObject('test.json');assert.equal(value?.etag,'"original-v1"');await writeObject('test.json','{}',{etag:value!.etag});await assert.rejects(writeObject('test.json','{}',{etag:value!.etag}),error=>error instanceof AppError&&error.status===409);mock.assertNoPendingInterceptors()}finally{setGlobalDispatcher(dispatcher);await mock.close();for(const name of names){if(old[name]===undefined)delete process.env[name];else process.env[name]=old[name]}}
});

test('AI results preserve metadata edits and reject changed source text',async()=>{
 const dir=await mkdtemp('/private/tmp/polka-source-test-');const data=process.env.LOCAL_DATA_DIR;const vercel=process.env.VERCEL;process.env.LOCAL_DATA_DIR=dir;delete process.env.VERCEL;
 try{
  const now=new Date().toISOString();const material:Material={id:randomUUID(),title:'Lecture',subject:'Math',kind:'pdf',createdAt:now,updatedAt:now,status:'inbox',excerpt:'',hasFile:false,text:'Original source text',summary:'',terms:[],questions:[],sourceVersion:1,revision:1};
  await saveMaterial('user-a',material);const snapshot=(await getMaterial('user-a',material.id)).value;
  const first=await getMaterial('user-a',material.id);await saveMaterial('user-a',{...first.value,title:'Renamed lecture',subject:'Calculus',revision:2},first.etag);
  const compiled=await applyMaterialResult('user-a',snapshot,{summary:'Verified summary',status:'ready',summaryVersion:1});assert.equal(compiled.title,'Renamed lecture');assert.equal(compiled.subject,'Calculus');
  const second=await getMaterial('user-a',material.id);await saveMaterial('user-a',{...second.value,text:'Human correction',summary:'',sourceVersion:2,revision:4},second.etag);
  await assert.rejects(applyMaterialResult('user-a',snapshot,{summary:'Old AI answer'}),error=>error instanceof AppError&&error.status===409);
  assert.equal((await getMaterial('user-a',material.id)).value.text,'Human correction');assert.equal((await getMaterial('user-a',material.id)).value.summary,'');
 }finally{await rm(dir,{recursive:true,force:true});if(data===undefined)delete process.env.LOCAL_DATA_DIR;else process.env.LOCAL_DATA_DIR=data;if(vercel===undefined)delete process.env.VERCEL;else process.env.VERCEL=vercel}
});

test('server chat history supports idempotence, interruption, retry and owner isolation',async()=>{
 const dir=await mkdtemp('/private/tmp/polka-chat-test-');const data=process.env.LOCAL_DATA_DIR;const vercel=process.env.VERCEL;process.env.LOCAL_DATA_DIR=dir;delete process.env.VERCEL;
 try{
  const requestId=randomUUID();const chat=await createChat('user-a','What is a derivative?',[],requestId);
  assert.equal((await createChat('user-a','What is a derivative?',[],requestId)).id,chat.id);
  const turn=await beginChatTurn('user-a',chat.id,{requestId,message:'What is a derivative?',action:'send'});const userId=turn.chat.pending!.userMessageId;
  await assert.rejects(beginChatTurn('user-a',chat.id,{requestId:randomUUID(),message:'Parallel question',action:'send'}),error=>error instanceof AppError&&error.status===409);
  await finishChatTurn('user-a',chat.id,requestId,'It is the local rate of change.',[]);
  const repeated=await beginChatTurn('user-a',chat.id,{requestId,message:'What is a derivative?',action:'send'});assert.ok(repeated.replay);assert.equal(repeated.chat.messages.length,2);
  const nextId=randomUUID();await beginChatTurn('user-a',chat.id,{requestId:nextId,action:'regenerate'});const failed=await finishChatTurn('user-a',chat.id,nextId,'Partial explanation',[],'Response stopped');assert.equal(failed.status,'failed');assert.equal(failed.messages[1].status,'interrupted');
  const retryId=randomUUID();const retry=await beginChatTurn('user-a',chat.id,{requestId:retryId,action:'retry'});assert.equal(retry.chat.pending!.userMessageId,userId);
  const complete=await finishChatTurn('user-a',chat.id,retryId,'Full explanation',[],undefined,{modelName:'gemini-test',tokenUsage:{input:10,output:5,total:15},estimatedCost:null});assert.equal(complete.messages.length,2);assert.equal(complete.status,'idle');assert.equal(complete.messages[1].generation?.tokenUsage.total,15);assert.equal(complete.answerVersions?.length,2);
  const emptyId=randomUUID();await beginChatTurn('user-a',chat.id,{requestId:emptyId,action:'regenerate'});const preserved=await finishChatTurn('user-a',chat.id,emptyId,'',[],'Quota exhausted');assert.equal(preserved.messages[1].content,'Full explanation');assert.equal(preserved.answerVersions?.length,2);
  const laterId=randomUUID();await beginChatTurn('user-a',chat.id,{requestId:laterId,message:'Explain a tangent.',action:'send'});await finishChatTurn('user-a',chat.id,laterId,'The tangent has that slope.',[]);
  // The earlier interrupted request must never erase a later conversation turn.
  await assert.rejects(beginChatTurn('user-a',chat.id,{requestId,message:'Changed old question',action:'send'}),error=>error instanceof AppError&&error.status===409);assert.equal((await getChat('user-a',chat.id)).value.messages.length,4);
  await assert.rejects(getChat('user-b',chat.id),error=>error instanceof AppError&&error.status===404);
  const checked=verifiedChatAnswer('Known [1], fabricated [99]',[{id:'material-id',title:'Source',index:1}]);assert.equal(checked.answer,'Known [1], fabricated ');assert.equal(checked.sources.length,1);
  await deleteChat('user-a',chat.id);await assert.rejects(getChat('user-a',chat.id),error=>error instanceof AppError&&error.status===404);
 }finally{await rm(dir,{recursive:true,force:true});if(data===undefined)delete process.env.LOCAL_DATA_DIR;else process.env.LOCAL_DATA_DIR=data;if(vercel===undefined)delete process.env.VERCEL;else process.env.VERCEL=vercel}
});

test('Gemini chat streams real deltas and receives saved conversation context',async()=>{
 const dir=await mkdtemp('/private/tmp/polka-stream-test-');const names=['LOCAL_DATA_DIR','VERCEL','GOOGLE_GENERATIVE_AI_API_KEY','AI_MODEL'];const old=Object.fromEntries(names.map(name=>[name,process.env[name]]));const fetch=globalThis.fetch;
 process.env.LOCAL_DATA_DIR=dir;delete process.env.VERCEL;process.env.GOOGLE_GENERATIVE_AI_API_KEY='mock-key';process.env.AI_MODEL='gemini-3.1-flash-lite';
 globalThis.fetch=async(url,init)=>{
  assert.match(String(url),/streamGenerateContent/);const payload=JSON.parse(String(init?.body));assert.ok(payload.contents.some((m:{parts:{text:string}[]})=>m.parts.some(p=>p.text.includes('rate of change'))));
  const events=[{candidates:[{content:{role:'model',parts:[{text:'A tangent '}]}}]},{candidates:[{content:{role:'model',parts:[{text:'has that slope.'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:10,candidatesTokenCount:5,totalTokenCount:15}}];
  return new Response(events.map(event=>'data: '+JSON.stringify(event)+'\n\n').join(''),{headers:{'Content-Type':'text/event-stream'}});
 };
 try{
  const chat=await createChat('user-a','What is a derivative?',[]);let requestId=randomUUID();await beginChatTurn('user-a',chat.id,{requestId,message:'What is a derivative?',action:'send'});await finishChatTurn('user-a',chat.id,requestId,'It is the rate of change.',[]);
  requestId=randomUUID();const turn=await beginChatTurn('user-a',chat.id,{requestId,message:'Explain a tangent.',action:'send'});const answer=await streamChatAnswer(turn.chat,[],'user-a',new AbortController().signal);const parts=[];
  for await(const part of answer.result.fullStream){if(part.type==='error')throw part.error;if(part.type==='text-delta')parts.push(part.text)}
  assert.deepEqual(parts,['A tangent ','has that slope.']);assert.deepEqual(answer.sources,[]);
 }finally{globalThis.fetch=fetch;await rm(dir,{recursive:true,force:true});for(const name of names){if(old[name]===undefined)delete process.env[name];else process.env[name]=old[name]}}
});
