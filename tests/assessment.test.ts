import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateStudy,assessAnswer} from '../lib/ai';
import {AppError,saveMaterial,getMaterial,getLibrary,saveAssessment} from '../lib/storage';
import type {Material} from '../lib/types';

test('structured self-check uses the lecture, persists metadata and guards changed source versions',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'polka-assess-'));const names=['LOCAL_DATA_DIR','VERCEL','GOOGLE_GENERATIVE_AI_API_KEY'];const old=Object.fromEntries(names.map(name=>[name,process.env[name]]));const originalFetch=globalThis.fetch;
 process.env.LOCAL_DATA_DIR=dir;delete process.env.VERCEL;process.env.GOOGLE_GENERATIVE_AI_API_KEY='mock-key-no-network';
 const text='A derivative is the local rate of change.';let calls=0;
 globalThis.fetch=async(url,init)=>{
  assert.match(String(url),/:generateContent/);const payload=JSON.parse(String(init?.body));assert.ok(JSON.stringify(payload.contents).includes(text));
  const output=calls++===0?{summary:'The derivative describes change.',concepts:[{title:'Derivative',description:'Local rate of change.',sourceQuote:'local rate of change'},{title:'Invented concept',description:'Unsupported explanation.',sourceQuote:'This is not in the lecture'}],questions:[{question:'What is a derivative?',answer:'The local rate of change.',sourceQuote:'local rate of change'}]}:{score:60,verdict:'correct',feedback:'You described change but missed its local nature.',missing:['Local nature'],sourceQuote:'A fabricated quote'};
  return Response.json({candidates:[{content:{role:'model',parts:[{text:JSON.stringify(output)}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:10,candidatesTokenCount:5,totalTokenCount:15}});
 };
 try{
  const now=new Date().toISOString();let material:Material={id:randomUUID(),title:'Calculus',subject:'Math',kind:'text',createdAt:now,updatedAt:now,status:'inbox',excerpt:'',hasFile:false,text,summary:'',terms:[],questions:[],sourceVersion:1,revision:1};
  const study=await generateStudy(material,'user-a');assert.deepEqual(study.terms,['Derivative']);assert.equal(study.concepts.length,1);
  material={...material,...study,status:'ready',summaryVersion:1};await saveMaterial('user-a',material);
  const assessment=await assessAnswer(material,0,'It describes change.','user-a');assert.equal(assessment.score,60);assert.equal(assessment.verdict,'partial');assert.equal(assessment.sourceQuote,'');assert.equal(assessment.generation.tokenUsage.total,15);
  await saveAssessment('user-a',material,assessment);await saveAssessment('user-a',material,assessment);assert.equal((await getMaterial('user-a',material.id)).value.assessments?.length,1);assert.equal((await getLibrary('user-a')).aiUsage.count,2);
  await assert.rejects(assessAnswer({...material,sourceVersion:2},0,'Answer','user-a'),error=>error instanceof AppError&&error.status===409);await assert.rejects(assessAnswer(material,99,'Answer','user-a'),error=>error instanceof AppError);assert.equal(calls,2);
  const latest=await getMaterial('user-a',material.id);await saveMaterial('user-a',{...latest.value,text:'Human corrected source.',sourceVersion:2,summaryVersion:undefined,revision:(latest.value.revision||1)+1},latest.etag);
  await assert.rejects(saveAssessment('user-a',material,{...assessment,id:randomUUID()}),error=>error instanceof AppError&&error.status===409);
  const corrected=(await getMaterial('user-a',material.id)).value;assert.equal(corrected.text,'Human corrected source.');assert.equal(corrected.assessments?.length,2);assert.ok(corrected.assessments?.every(result=>result.sourceVersion===1));
 }finally{globalThis.fetch=originalFetch;await rm(dir,{recursive:true,force:true});for(const name of names){if(old[name]===undefined)delete process.env[name];else process.env[name]=old[name]}}
});
