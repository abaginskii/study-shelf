import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifiedConcepts,verifiedAssessment} from '../lib/ai';
import {AppError,getLibrary,getMaterial,importMaterialTopics,mutateLibrary,saveMaterial} from '../lib/storage';
import {PILOT_LIMITS} from '../lib/plans';
import type {Assessment,Concept,Material,Topic} from '../lib/types';

const SOURCE='Производная показывает мгновенную скорость изменения функции. Касательная имеет наклон, равный производной. Йота — буква греческого алфавита.';
const CONCEPTS:Concept[]=[
 {title:'Скорость изменения',description:'Производная описывает мгновенную скорость изменения.',sourceQuote:'Производная показывает мгновенную скорость изменения функции.'},
 {title:'Касательная',description:'Наклон касательной равен производной.',sourceQuote:'Касательная имеет наклон, равный производной.'},
];
function material(concepts:Concept[]=CONCEPTS):Material{
 const now=new Date().toISOString();
 return {id:randomUUID(),title:'Учебный источник',subject:'Математика',kind:'text',createdAt:now,updatedAt:now,status:'ready',excerpt:'',hasFile:false,text:SOURCE,summary:'Производная и касательная.',terms:concepts.map(concept=>concept.title),concepts,questions:[],sourceVersion:3,summaryVersion:3,revision:1};
}
async function localStorage(run:()=>Promise<void>){
 const directory=await mkdtemp(join(tmpdir(),'polka-knowledge-'));
 const previous=process.env.LOCAL_DATA_DIR;const vercel=process.env.VERCEL;
 process.env.LOCAL_DATA_DIR=directory;delete process.env.VERCEL;
 try{await run()}finally{
  await rm(directory,{recursive:true,force:true});
  if(previous===undefined)delete process.env.LOCAL_DATA_DIR;else process.env.LOCAL_DATA_DIR=previous;
  if(vercel===undefined)delete process.env.VERCEL;else process.env.VERCEL=vercel;
 }
}
function errorStatus(status:number){return (error:unknown)=>error instanceof AppError&&error.status===status}
function existingTopic(source:Material,title:string):Topic{
 return {id:randomUUID(),title,body:'Существующее объяснение пользователя.',materialId:source.id,createdAt:source.createdAt,sourceQuote:CONCEPTS[0].sourceQuote,sourceVersion:source.sourceVersion};
}

test('concepts and assessment quotations must match the original source exactly',()=>{
 const iota={title:'Йота',description:'Греческая буква.',sourceQuote:'Йота — буква греческого алфавита.'};
 const concepts=verifiedConcepts([
  ...CONCEPTS,
  {...CONCEPTS[0],title:'  СКОРОСТЬ   ИЗМЕНЕНИЯ  '},
  {...CONCEPTS[0],title:'Выдуманная цитата',sourceQuote:'Производная показывает среднюю скорость изменения функции.'},
  {...CONCEPTS[0],title:'Неверный регистр цитаты',sourceQuote:CONCEPTS[0].sourceQuote.toLowerCase()},
  {...CONCEPTS[0],title:'Пустая цитата',sourceQuote:'   '},
  {...CONCEPTS[0],title:' '},
  {...CONCEPTS[0],description:' '},
  iota,{...iota,title:'И\u0306ОТА'},
 ],SOURCE);
 assert.deepEqual(concepts.map(concept=>concept.title),['Скорость изменения','Касательная','Йота']);
 assert.ok(concepts.every(concept=>SOURCE.includes(concept.sourceQuote)));
 const assessment:Assessment={score:70,verdict:'partial',feedback:'Нужно уточнить скорость изменения.',missing:['Мгновенная скорость'],sourceQuote:'Invented quotation'};
 assert.equal(verifiedAssessment(assessment,SOURCE).sourceQuote,'');
 assert.equal(verifiedAssessment({...assessment,sourceQuote:CONCEPTS[0].sourceQuote},SOURCE).sourceQuote,CONCEPTS[0].sourceQuote);
});

test('bulk import reads server concepts and deduplicates by normalized title and source',async()=>localStorage(async()=>{
 const iota={title:'Йота',description:'Греческая буква.',sourceQuote:'Йота — буква греческого алфавита.'};
 const source=material([
  ...CONCEPTS,{...CONCEPTS[0],title:'  СКОРОСТЬ\t  ИЗМЕНЕНИЯ  '},
  iota,{...iota,title:'И\u0306ОТА'},
  {...CONCEPTS[0],title:'Неподтверждённое понятие',sourceQuote:'Такого объяснения нет в источнике.'},
 ]);
 await saveMaterial('owner-a',source);
 const forgedSnapshot={...source,concepts:[{...CONCEPTS[0],description:'Подменённое клиентское объяснение.'}]};
 const first=await importMaterialTopics('owner-a',forgedSnapshot);
 assert.equal(first.added,3);assert.equal(first.skipped,2);assert.equal(first.topics.length,3);
 assert.equal(first.topics.find(topic=>topic.title==='Скорость изменения')?.body,CONCEPTS[0].description);
 assert.ok(first.topics.every(topic=>topic.materialId===source.id&&topic.sourceVersion===3&&SOURCE.includes(topic.sourceQuote||'!')));
 const second=await importMaterialTopics('owner-a',source);
 assert.equal(second.added,0);assert.equal(second.skipped,5);
 assert.deepEqual(second.topics.map(topic=>topic.id),first.topics.map(topic=>topic.id));
 assert.equal((await getLibrary('owner-a')).topics.length,3);
 const anotherSource={...source,id:randomUUID()};await saveMaterial('owner-a',anotherSource);
 const another=await importMaterialTopics('owner-a',anotherSource);
 assert.equal(another.added,3);assert.equal((await getLibrary('owner-a')).topics.length,6);
 assert.ok(another.topics.every(topic=>topic.materialId===anotherSource.id));
}));

test('topic capacity rejects a whole batch and permits duplicate-only imports at the limit',async()=>localStorage(async()=>{
 const source=material();await saveMaterial('owner-a',source);
 await mutateLibrary('owner-a',library=>{library.topics=Array.from({length:PILOT_LIMITS.topics-1},(_,index)=>existingTopic(source,`Existing ${index}`))});
 const before=await getLibrary('owner-a');
 await assert.rejects(importMaterialTopics('owner-a',source),errorStatus(400));
 assert.deepEqual(await getLibrary('owner-a'),before);
 await mutateLibrary('owner-a',library=>{
  library.topics=[...CONCEPTS.map(concept=>existingTopic(source,concept.title)),...Array.from({length:PILOT_LIMITS.topics-CONCEPTS.length},(_,index)=>existingTopic(source,`Existing ${index}`))];
 });
 const full=await getLibrary('owner-a');
 const duplicateOnly=await importMaterialTopics('owner-a',source);
 assert.equal(duplicateOnly.added,0);assert.equal(duplicateOnly.skipped,2);
 assert.deepEqual(await getLibrary('owner-a'),full);
 assert.ok(duplicateOnly.topics.every(topic=>topic.body==='Существующее объяснение пользователя.'));
}));

test('parallel repeated imports keep unique topics and concurrent batches never exceed capacity',async()=>localStorage(async()=>{
 const source=material();await saveMaterial('owner-a',source);
 const repeated=await Promise.all([importMaterialTopics('owner-a',source),importMaterialTopics('owner-a',source)]);
 assert.equal(repeated.reduce((sum,result)=>sum+result.added,0),2);
 assert.equal(repeated.reduce((sum,result)=>sum+result.skipped,0),2);
 const topics=(await getLibrary('owner-a')).topics;
 assert.equal(topics.length,2);assert.equal(new Set(topics.map(topic=>topic.id)).size,2);
 assert.deepEqual(repeated[0].topics.map(topic=>topic.id).sort(),repeated[1].topics.map(topic=>topic.id).sort());
 const left=material([CONCEPTS[0]]),right=material([CONCEPTS[1]]);
 await saveMaterial('near-capacity',left);await saveMaterial('near-capacity',right);
 await mutateLibrary('near-capacity',library=>{library.topics=Array.from({length:PILOT_LIMITS.topics-1},(_,index)=>existingTopic(left,`Existing ${index}`))});
 const concurrent=await Promise.allSettled([importMaterialTopics('near-capacity',left),importMaterialTopics('near-capacity',right)]);
 assert.equal(concurrent.filter(result=>result.status==='fulfilled').length,1);
 const failure=concurrent.find(result=>result.status==='rejected');
 assert.ok(failure?.status==='rejected'&&errorStatus(400)(failure.reason));
 assert.equal((await getLibrary('near-capacity')).topics.length,PILOT_LIMITS.topics);
}));

test('foreign materials and stale study versions cannot mutate the knowledge base',async()=>localStorage(async()=>{
 const source=material();await saveMaterial('owner-a',source);
 const ownerBefore=await getLibrary('owner-a'),foreignBefore=await getLibrary('owner-b');
 await assert.rejects(importMaterialTopics('owner-b',source),errorStatus(404));
 assert.deepEqual(await getLibrary('owner-a'),ownerBefore);assert.deepEqual(await getLibrary('owner-b'),foreignBefore);
 await assert.rejects(importMaterialTopics('owner-a',{...source,sourceVersion:2}),errorStatus(409));
 await assert.rejects(importMaterialTopics('owner-a',{...source,text:SOURCE+' Client modification.'}),errorStatus(409));
 let stored=await getMaterial('owner-a',source.id);
 await saveMaterial('owner-a',{...stored.value,summaryVersion:2,revision:2},stored.etag);
 stored=await getMaterial('owner-a',source.id);
 const staleBefore=await getLibrary('owner-a');
 await assert.rejects(importMaterialTopics('owner-a',stored.value),errorStatus(409));
 assert.deepEqual(await getLibrary('owner-a'),staleBefore);
 await saveMaterial('owner-a',{...stored.value,summaryVersion:3,concepts:[],revision:3},stored.etag);
 const noConcepts=(await getMaterial('owner-a',source.id)).value;
 await assert.rejects(importMaterialTopics('owner-a',{...noConcepts,concepts:CONCEPTS}),errorStatus(400));
 assert.equal((await getLibrary('owner-a')).topics.length,0);
}));
