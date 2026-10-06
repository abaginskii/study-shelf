import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {assessAnswer} from '../lib/ai';
import {AppError,MAX_ASSESSMENTS,MAX_MATERIAL_BYTES,assertAssessmentCapacity,getLibrary,getMaterial,saveMaterial,saveAssessment} from '../lib/storage';
import type {Material,AssessmentRecord} from '../lib/types';

const SOURCE='Производная описывает мгновенную скорость изменения функции.';
function material(count=0):Material{
 const now=new Date().toISOString();
 const source:Material={id:randomUUID(),title:'Производная',subject:'Математика',kind:'text',createdAt:now,updatedAt:now,status:'ready',excerpt:'',hasFile:false,text:SOURCE,summary:'Объяснение производной.',terms:[],questions:[{question:'Что описывает производная?',answer:'Мгновенную скорость изменения.',sourceQuote:SOURCE}],sourceVersion:1,summaryVersion:1,revision:1};
 source.assessments=Array.from({length:count},(_,index)=>assessment(source,`Сохранённый ответ ${index}`));
 return source;
}
function assessment(source:Material,answer='Мгновенная скорость изменения.'):AssessmentRecord{
 return {id:randomUUID(),questionIndex:0,question:source.questions[0].question,answer,sourceVersion:source.sourceVersion,createdAt:new Date().toISOString(),score:100,verdict:'correct',feedback:'Смысл объяснён верно.',missing:[],sourceQuote:SOURCE,generation:{modelName:'mock-model',tokenUsage:{input:1,output:1,total:2},estimatedCost:null}};
}
const capacityError=(error:unknown)=>error instanceof AppError&&error.status===400;
async function isolated(run:(networkCalls:()=>number)=>Promise<void>){
 const directory=await mkdtemp(join(tmpdir(),'polka-assessment-limits-'));
 const names=['LOCAL_DATA_DIR','VERCEL','GOOGLE_GENERATIVE_AI_API_KEY'];
 const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 const originalFetch=globalThis.fetch;let calls=0;
 process.env.LOCAL_DATA_DIR=directory;delete process.env.VERCEL;process.env.GOOGLE_GENERATIVE_AI_API_KEY='test-key-never-call-provider';
 globalThis.fetch=async()=>{calls++;throw new Error('Provider requests are forbidden in capacity tests')};
 try{await run(()=>calls)}finally{
  globalThis.fetch=originalFetch;await rm(directory,{recursive:true,force:true});
  for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name]}
 }
}
function paddedMaterial(targetBytes:number){
 const source=material();source.summary='';
 source.summary='x'.repeat(targetBytes-Buffer.byteLength(JSON.stringify(source)));
 assert.equal(Buffer.byteLength(JSON.stringify(source)),targetBytes);
 return source;
}

test('80 saved assessments reject before AI quota and retain every prior result',async()=>isolated(async networkCalls=>{
 assert.equal(MAX_ASSESSMENTS,80);
 const source=material(MAX_ASSESSMENTS);await saveMaterial('owner-a',source);
 const before=(await getMaterial('owner-a',source.id)).value,libraryBefore=await getLibrary('owner-a');
 assert.throws(()=>assertAssessmentCapacity(before,0,'Новый ответ.'),capacityError);
 await assert.rejects(assessAnswer(before,0,'Мгновенная скорость изменения.','owner-a'),capacityError);
 assert.equal(networkCalls(),0);assert.deepEqual(await getLibrary('owner-a'),libraryBefore);
 await assert.rejects(saveAssessment('owner-a',before,assessment(before)),capacityError);
 const after=(await getMaterial('owner-a',source.id)).value;
 assert.deepEqual(after,before);assert.equal(after.assessments?.length,MAX_ASSESSMENTS);
 // Replaying an already saved result remains idempotent even at full capacity.
 assert.deepEqual(await saveAssessment('owner-a',before,before.assessments![0]),before.assessments![0]);
 assert.deepEqual((await getMaterial('owner-a',source.id)).value.assessments,before.assessments);
}));

test('concurrent saves recheck capacity after CAS without slicing old assessment history',async()=>isolated(async networkCalls=>{
 const source=material(MAX_ASSESSMENTS-1);await saveMaterial('owner-a',source);
 const snapshot=(await getMaterial('owner-a',source.id)).value;
 const additions=[assessment(snapshot,'Первый новый ответ.'),assessment(snapshot,'Второй новый ответ.')];
 const outcomes=await Promise.allSettled(additions.map(result=>saveAssessment('owner-a',snapshot,result)));
 assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);
 const failure=outcomes.find(result=>result.status==='rejected');
 assert.ok(failure?.status==='rejected'&&capacityError(failure.reason));
 const saved=(await getMaterial('owner-a',source.id)).value.assessments!;
 assert.equal(saved.length,MAX_ASSESSMENTS);
 for(const old of snapshot.assessments!)assert.deepEqual(saved.find(result=>result.id===old.id),old);
 assert.equal(networkCalls(),0);assert.equal((await getLibrary('owner-a')).aiUsage.count,0);
}));

test('near 3 MiB materials reject preflight and actual oversized results without AI use or data loss',async()=>isolated(async networkCalls=>{
 assert.equal(MAX_MATERIAL_BYTES,3*1024*1024);
 const source=paddedMaterial(Math.floor(MAX_MATERIAL_BYTES*2.99/3));await saveMaterial('owner-a',source);
 const libraryBefore=await getLibrary('owner-a');
 assert.throws(()=>assertAssessmentCapacity(source,0,'Короткий ответ.'),capacityError);
 await assert.rejects(assessAnswer(source,0,'Мгновенная скорость изменения.','owner-a'),capacityError);
 assert.equal(networkCalls(),0);assert.deepEqual(await getLibrary('owner-a'),libraryBefore);
 assert.deepEqual((await getMaterial('owner-a',source.id)).value,source);
 const almostFull=paddedMaterial(MAX_MATERIAL_BYTES-1024);await saveMaterial('owner-b',almostFull);
 const before=(await getMaterial('owner-b',almostFull.id)).value;
 const oversized={...assessment(before),feedback:'Ф'.repeat(2000)};
 assert.ok(Buffer.byteLength(JSON.stringify({...before,assessments:[oversized]}))>MAX_MATERIAL_BYTES);
 await assert.rejects(saveAssessment('owner-b',before,oversized),capacityError);
 assert.deepEqual((await getMaterial('owner-b',almostFull.id)).value,before);
 assert.equal((await getLibrary('owner-b')).aiUsage.count,0);assert.equal(networkCalls(),0);
}));
