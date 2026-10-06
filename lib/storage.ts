import {get,put,del,BlobPreconditionFailedError} from '@vercel/blob';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {emptyLibrary,type Library,type Material,type MaterialCard,type Chat,type ChatMessage,type Topic,type AssessmentRecord} from './types';
import {PILOT_LIMITS} from './plans';
export class AppError extends Error {constructor(message:string,public status=400){super(message)}}
const local=()=>process.env.LOCAL_DATA_DIR && !process.env.VERCEL ? process.env.LOCAL_DATA_DIR : undefined;
export const storageReady=()=>!!(local()||process.env.BLOB_READ_WRITE_TOKEN||process.env.BLOB_STORE_ID);
const validPath=(path:string)=>{if(!/^[a-zA-Z0-9/_\-.]+$/.test(path)||path.includes('..'))throw new AppError('Некорректный путь');return path};
const sha=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
export async function readObject(path:string):Promise<{data:Buffer;etag:string}|null>{
 validPath(path);if(!storageReady())throw new AppError('Хранилище ещё не подключено. Попробуйте позже.',503);
 if(local()){try{const data=await readFile(join(local()!,path));return {data,etag:sha(data)}}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e}}
 // CAS must use the validator for the exact, uncompressed JSON representation.
 const result=await get(path,{access:'private',useCache:false,headers:{'Accept-Encoding':'identity'}});
 if(!result?.stream)return null;return {data:Buffer.from(await new Response(result.stream).arrayBuffer()),etag:result.blob.etag};
}
const locks=new Map<string,Promise<unknown>>();
async function localLocked<T>(path:string,fn:()=>Promise<T>):Promise<T>{const prior=locks.get(path)||Promise.resolve();const current=prior.catch(()=>{}).then(fn);locks.set(path,current);try{return await current}finally{if(locks.get(path)===current)locks.delete(path)}}
export async function writeObject(path:string,data:Buffer|string,options:{etag?:string;createOnly?:boolean;contentType?:string}={}):Promise<void>{
 validPath(path);if(!storageReady())throw new AppError('Хранилище ещё не подключено.',503);const bytes=Buffer.from(data);
 if(local())return localLocked(path,async()=>{const old=await readObject(path);if((options.createOnly&&old)||(options.etag&&old?.etag!==options.etag))throw new AppError('Конфликт изменений',409);const target=join(local()!,path);await mkdir(join(target,'..'),{recursive:true});const tmp=target+'.'+randomUUID();await writeFile(tmp,bytes,{mode:0o600});await rename(tmp,target)});
 try{await put(path,bytes,{access:'private',addRandomSuffix:false,allowOverwrite:!options.createOnly,ifMatch:options.etag,contentType:options.contentType||'application/json',cacheControlMaxAge:60})}catch(e){if(e instanceof BlobPreconditionFailedError || /already exists/i.test(String(e)))throw new AppError('Конфликт изменений',409);throw e}
}
export async function removeObject(path:string){validPath(path);if(local()){await unlink(join(local()!,path)).catch(e=>{if(e.code!=='ENOENT')throw e});return}await del(path)}
export async function readJSON<T>(path:string):Promise<{value:T;etag:string}|null>{const result=await readObject(path);return result?{value:JSON.parse(result.data.toString()),etag:result.etag}:null}
export const userPath=(id:string)=>`users/${id}`;
export const libPath=(id:string)=>`${userPath(id)}/library.json`;
export async function getLibrary(id:string){return (await readJSON<Library>(libPath(id)))?.value||emptyLibrary()}
export async function mutateLibrary(id:string,mutate:(library:Library)=>void){for(let i=0;i<5;i++){const old=await readJSON<Library>(libPath(id));const value=old?.value||emptyLibrary();mutate(value);try{await writeObject(libPath(id),JSON.stringify(value),old?{etag:old.etag}:{createOnly:true});return value}catch(e){if(!(e instanceof AppError)||e.status!==409)throw e}}throw new AppError('Материалы изменились в другой вкладке. Повторите действие.',409)}
export const materialPath=(uid:string,id:string)=>`${userPath(uid)}/materials/${id}.json`;
export function safeId(id:string){if(!/^[0-9a-f-]{36}$/.test(id))throw new AppError('Материал не найден',404);return id}
export async function getMaterial(uid:string,id:string){safeId(id);if(!(await getLibrary(uid)).materials.some(m=>m.id===id))throw new AppError('Материал не найден',404);const result=await readJSON<Material>(materialPath(uid,id));if(!result)throw new AppError('Материал не найден',404);return result}
export function card(m:Material):MaterialCard{return {id:m.id,title:m.title,subject:m.subject,kind:m.kind,createdAt:m.createdAt,updatedAt:m.updatedAt,status:m.status,excerpt:m.text.slice(0,200),hasFile:m.hasFile,filename:m.filename,size:m.size,revision:m.revision||1}}
export async function saveMaterial(uid:string,m:Material,etag?:string,staged?:string){await writeObject(materialPath(uid,m.id),JSON.stringify(m),etag?{etag}:{createOnly:true});await mutateLibrary(uid,lib=>{const idx=lib.materials.findIndex(x=>x.id===m.id);if(idx<0){if(etag)throw new AppError('Материал уже удалён.',404);if(lib.materials.reduce((sum,x)=>sum+(x.size||0),0)+(lib.uploads||[]).filter(x=>x.pathname!==staged).reduce((sum,x)=>sum+x.size,0)+(m.size||0)>PILOT_LIMITS.storageBytes)throw new AppError('Лимит хранилища: 300 МБ.');if(lib.materials.length>=PILOT_LIMITS.materials)throw new AppError(`Достигнут лимит: ${PILOT_LIMITS.materials} материалов. Удалите ненужные.`);lib.materials.unshift(card(m))}else {if((lib.materials[idx].revision||1)>(m.revision||1))throw new AppError('Материал изменён в другой вкладке.',409);lib.materials[idx]=card(m)}if(staged)lib.uploads=(lib.uploads||[]).filter(x=>x.pathname!==staged)})}

export async function fileStream(path:string,range:string|null){validPath(path);if(local()){const result=await readObject(path);return result?{stream:new Response(new Uint8Array(result.data)).body,contentRange:null,size:result.data.length}:null}const result=await get(path,{access:'private',useCache:false,headers:range?{Range:range}:undefined});return result?.stream?{stream:result.stream,contentRange:result.headers.get('content-range'),size:Number(result.headers.get('content-length')||result.blob.size||0)}:null}

// Rebase AI results over metadata edits, while rejecting changes to their source.
export async function applyMaterialResult(uid:string,snapshot:Material,changes:Partial<Material>){
 for(let attempt=0;attempt<5;attempt++){
  const latest=await getMaterial(uid,snapshot.id);
  if(latest.value.sourceVersion!==snapshot.sourceVersion||latest.value.text!==snapshot.text)throw new AppError('Текст источника изменился во время обработки. Создайте конспект по обновлённому тексту.',409);
  const material={...latest.value,...changes,updatedAt:new Date().toISOString(),revision:(latest.value.revision||1)+1};
  try{await saveMaterial(uid,material,latest.etag);return material}catch(error){if(!(error instanceof AppError)||error.status!==409)throw error}
 }
 throw new AppError('Материал изменяется в другой вкладке. Повторите обработку.',409);
}

const topicKey=(title:string)=>title.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru');
export async function importMaterialTopics(uid:string,snapshot:Material){
 const material=(await getMaterial(uid,snapshot.id)).value;
 if(material.sourceVersion!==snapshot.sourceVersion||material.text!==snapshot.text||!material.summary.trim()||material.summaryVersion!==material.sourceVersion)throw new AppError('Конспект изменился. Обновите материал и создайте конспект по текущему тексту.',409);
 const concepts=(material.concepts||[]).filter(concept=>concept.title.trim()&&concept.description.trim()&&concept.sourceQuote&&concept.sourceQuote.length<=500&&material.text.includes(concept.sourceQuote));
 if(!concepts.length)throw new AppError('В материале нет понятий с подтверждёнными цитатами. Создайте конспект заново.');
 let added=0,skipped=0;let topics:Topic[]=[];
 await mutateLibrary(uid,library=>{
  const source=library.materials.find(item=>item.id===material.id);if(!source)throw new AppError('Материал не найден.',404);
  if((source.revision||1)!==(material.revision||1))throw new AppError('Материал изменился во время импорта. Обновите его.',409);
  const existing=new Map(library.topics.filter(topic=>topic.materialId===material.id).map(topic=>[topicKey(topic.title),topic]));
  const pending:Topic[]=[];topics=[];skipped=0;
  for(const concept of concepts){
   const key=topicKey(concept.title);const duplicate=existing.get(key);
   if(duplicate){skipped++;if(!topics.some(topic=>topic.id===duplicate.id))topics.push(duplicate);continue}
   const topic:Topic={id:randomUUID(),title:concept.title.trim().slice(0,160),body:concept.description.trim().slice(0,2000),materialId:material.id,sourceQuote:concept.sourceQuote,sourceVersion:material.sourceVersion,createdAt:new Date().toISOString()};
   existing.set(key,topic);pending.push(topic);topics.push(topic);
  }
  if(library.topics.length+pending.length>PILOT_LIMITS.topics)throw new AppError(`Для всех понятий недостаточно места: можно сохранить до ${PILOT_LIMITS.topics} тем. Удалите ненужные темы и повторите импорт.`,400);
  added=pending.length;library.topics.unshift(...pending);
 });
 return {added,skipped,topics,material};
}

export const MAX_ASSESSMENTS=PILOT_LIMITS.assessmentsPerMaterial;
export const MAX_MATERIAL_BYTES=3*1024*1024;
export function assertAssessmentCapacity(material:Material,questionIndex:number,answer:string){
 if((material.assessments?.length||0)>=MAX_ASSESSMENTS)throw new AppError(`В этой лекции сохранены ${MAX_ASSESSMENTS} проверок ИИ. История сохранена; продолжить самопроверку можно в новом материале.`);
 // Reserve the bounded generated fields plus the exact answer/question before spending an AI request.
 const extra=Buffer.byteLength(JSON.stringify({answer,question:material.questions[questionIndex]?.question||''}));
 if(Buffer.byteLength(JSON.stringify(material))+extra+64*1024>MAX_MATERIAL_BYTES)throw new AppError('В материале больше нет места для истории проверок. История сохранена; создайте новый материал для дальнейшей самопроверки.');
}
export async function saveAssessment(uid:string,snapshot:Material,assessment:AssessmentRecord){
 for(let attempt=0;attempt<5;attempt++){
  const latest=await getMaterial(uid,snapshot.id);
  const existing=latest.value.assessments?.find(item=>item.id===assessment.id);if(existing)return existing;
  if((latest.value.assessments?.length||0)>=MAX_ASSESSMENTS)throw new AppError(`В этой лекции уже сохранены ${MAX_ASSESSMENTS} проверок ИИ. История сохранена.`);
  const current=latest.value.sourceVersion===snapshot.sourceVersion&&latest.value.text===snapshot.text&&JSON.stringify(latest.value.questions[assessment.questionIndex])===JSON.stringify(snapshot.questions[assessment.questionIndex]);
  const material={...latest.value,assessments:[...(latest.value.assessments||[]),assessment],updatedAt:new Date().toISOString(),revision:(latest.value.revision||1)+1};
  if(Buffer.byteLength(JSON.stringify(material))>MAX_MATERIAL_BYTES)throw new AppError('В материале больше нет места для истории проверок. История сохранена.');
  try{await saveMaterial(uid,material,latest.etag)}catch(error){if(error instanceof AppError&&error.status===409)continue;throw error}
  // Retain the paid result with its original version, but never return it as a check of a new question.
  if(!current)throw new AppError('Текст или вопрос изменился во время проверки. Повторите проверку по обновлённому материалу.',409);
  return assessment;
 }
 throw new AppError('Материал изменяется в другой вкладке. Обновите его.',409);
}

const chatPath=(uid:string,id:string)=>`${userPath(uid)}/chats/${safeId(id)}.json`;
const chatCard=(chat:Chat)=>({id:chat.id,title:chat.title,updatedAt:chat.updatedAt,materialIds:chat.materialIds});
export async function getChat(uid:string,id:string){
 if(!(await getLibrary(uid)).chats?.some(chat=>chat.id===safeId(id)))throw new AppError('Чат не найден.',404);
 const result=await readJSON<Chat>(chatPath(uid,id));if(!result)throw new AppError('Чат не найден.',404);return result;
}
export async function mutateChat(uid:string,id:string,change:(chat:Chat)=>void){
 for(let attempt=0;attempt<5;attempt++){
  const old=await getChat(uid,id);const chat=old.value;change(chat);chat.revision++;chat.updatedAt=new Date().toISOString();
  try{await writeObject(chatPath(uid,id),JSON.stringify(chat),{etag:old.etag})}catch(error){if(error instanceof AppError&&error.status===409)continue;throw error}
  // History is authoritative; a delayed card refresh must not undo a saved turn.
  await mutateLibrary(uid,lib=>{const index=lib.chats?.findIndex(x=>x.id===id)??-1;if(index>=0&&lib.chats![index].updatedAt<=chat.updatedAt)lib.chats![index]=chatCard(chat)}).catch(()=>console.error('Chat index refresh deferred'));
  return chat;
 }
 throw new AppError('Чат изменился в другой вкладке. Обновите историю.',409);
}
export async function createChat(uid:string,message:string,materialIds:string[],id:string=randomUUID()){
 const now=new Date().toISOString();const chat:Chat={id,title:message.slice(0,80),updatedAt:now,materialIds,messages:[],status:'idle',revision:1};
 try{await writeObject(chatPath(uid,id),JSON.stringify(chat),{createOnly:true})}catch(error){if(error instanceof AppError&&error.status===409)return (await getChat(uid,id)).value;throw error}
 try{await mutateLibrary(uid,lib=>{lib.chats??=[];if(lib.chats.length>=PILOT_LIMITS.chats)throw new AppError(`Можно сохранить до ${PILOT_LIMITS.chats} чатов. Удалите ненужные.`);lib.chats.unshift(chatCard(chat))})}catch(error){await removeObject(chatPath(uid,id));throw error}
 return chat;
}
export async function beginChatTurn(uid:string,id:string,input:{requestId:string;message?:string;materialIds?:string[];action:'send'|'retry'|'regenerate'}){
 const old=(await getChat(uid,id)).value;
 const completed=old.messages.find(message=>message.role==='assistant'&&message.requestId===input.requestId&&message.status==='complete');
 if(completed)return {chat:old,replay:completed};
 let replay:ChatMessage|undefined;
 const chat=await mutateChat(uid,id,chat=>{
  replay=chat.messages.find(message=>message.role==='assistant'&&message.requestId===input.requestId&&message.status==='complete');if(replay)return;
  if(chat.pending&&chat.pending.startedAt>Date.now()-150000)throw new AppError('В этом чате уже готовится ответ. Дождитесь его или обновите историю.',409);
  if(chat.messages.filter(m=>m.role==='assistant').length+(chat.answerVersions?.length||0)>=PILOT_LIMITS.chatAnswers)throw new AppError(`В этом чате уже ${PILOT_LIMITS.chatAnswers} ответов и вариантов. Создайте новый чат; текущая история сохранится.`);
  if(input.materialIds!==undefined)chat.materialIds=input.materialIds;
  let userMessage:ChatMessage;
  if(input.action==='send'){
   if(!input.message?.trim())throw new AppError('Напишите сообщение.');
   // A retried HTTP request with the same id does not duplicate its user turn.
   const existing=chat.messages.find(m=>m.role==='user'&&m.requestId===input.requestId);
   if(existing&&(existing.id!==chat.messages.findLast(m=>m.role==='user')?.id||existing.content!==input.message))throw new AppError('Этот запрос уже относится к предыдущему сообщению. Обновите историю чата.',409);
   if(!existing&&chat.messages.filter(message=>message.role==='user').length>=PILOT_LIMITS.chatQuestions)throw new AppError(`В этом чате уже ${PILOT_LIMITS.chatQuestions} вопросов. Создайте новый чат; история текущего сохранится.`);
   userMessage=existing||{id:randomUUID(),role:'user',content:input.message,createdAt:new Date().toISOString(),requestId:input.requestId};
   if(!chat.messages.some(m=>m.id===userMessage.id))chat.messages.push(userMessage);
  }else{
   const lastUser=chat.messages.findLast(m=>m.role==='user');if(!lastUser)throw new AppError('В чате ещё нет вопроса.');userMessage=lastUser;
  }
  chat.pending={requestId:input.requestId,userMessageId:userMessage.id,assistantMessageId:randomUUID(),startedAt:Date.now()};chat.status='streaming';chat.error=undefined;
 });
 return {chat,replay};
}
export async function finishChatTurn(uid:string,id:string,requestId:string,content:string,sources:ChatMessage['sources'],error?:string,generation?:ChatMessage['generation']){
 return mutateChat(uid,id,chat=>{
  const pending=chat.pending;if(!pending||pending.requestId!==requestId)throw new AppError('Этот ответ больше не является текущим.',409);
  const userIndex=chat.messages.findIndex(m=>m.id===pending.userMessageId);if(userIndex<0)throw new AppError('Вопрос не найден.',409);
  if(error&&!content.trim()){chat.status='failed';chat.error=error;chat.pending=undefined;return}
  const previous=chat.messages.slice(userIndex+1).filter(message=>message.role==='assistant');
  if(previous.length)chat.answerVersions=[...(chat.answerVersions||[]),...previous];
  // Retry replaces the previous assistant answer, keeping the original user turn.
  chat.messages=chat.messages.slice(0,userIndex+1);
  if(content.trim())chat.messages.push({id:pending.assistantMessageId,role:'assistant',content,createdAt:new Date().toISOString(),requestId,sources,status:error?'interrupted':'complete',generation});
  chat.status=error?'failed':'idle';chat.error=error;chat.pending=undefined;
 });
}
export async function deleteChat(uid:string,id:string){await getChat(uid,id);await mutateLibrary(uid,lib=>{lib.chats=(lib.chats||[]).filter(chat=>chat.id!==id)});await removeObject(chatPath(uid,id))}
