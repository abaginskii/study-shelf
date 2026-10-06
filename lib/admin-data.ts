import {AppError,getLibrary,getMaterial,getChat,listObjects,readJSON,writeObject,safeId,readObject} from './storage';
import {ownerConfigured} from './admin-auth';
import {aiAvailable} from './ai';
import {billingConfigured,billingEnabled,billingTest,billingHealthCheck,type BillingOrder} from './billing';
import {AI_PERIOD_MS} from './plans';
import type {User,Library} from './types';
import type {OwnerOverview,OwnerUser,OwnerDetail,OwnerLibrary,OwnerHealth,HealthCheck,OwnerContent} from './admin-types';

const MAX_USERS=1000;
async function mapLimit<T,R>(items:T[],fn:(item:T)=>Promise<R>){const results:R[]=[];let next=0;await Promise.all(Array.from({length:Math.min(8,items.length)},async()=>{while(next<items.length){const index=next++;results[index]=await fn(items[index])}}));return results}
export function safeOwnerUser(user:User,library:Library,now=Date.now()):OwnerUser{
 const start=Date.parse(library.aiPeriod?.startedAt||'');const current=Number.isFinite(start)&&start<=now&&start+AI_PERIOD_MS>now;
 const timestamps=[...library.materials.map(item=>item.updatedAt),...(library.chats||[]).map(item=>item.updatedAt),...library.topics.map(item=>item.createdAt)].filter(value=>Number.isFinite(Date.parse(value))).sort();
 return {id:user.id,username:user.username,createdAt:user.createdAt,materials:library.materials.length,ready:library.materials.filter(item=>item.status==='ready').length,topics:library.topics.length,chats:library.chats?.length||0,reviews:library.reviews,fileBytes:library.materials.reduce((sum,item)=>sum+(item.size||0),0),reservedBytes:(library.uploads||[]).reduce((sum,item)=>sum+item.size,0),aiToday:library.aiUsage.day===new Date(now).toISOString().slice(0,10)?library.aiUsage.count:0,aiPeriod:current?library.aiPeriod!.count:0,lastContentAt:timestamps.at(-1)||null};
}
export function safeOwnerLibrary(library:Library):OwnerLibrary{return {materials:library.materials,topics:library.topics,reviews:library.reviews,chats:library.chats,aiUsage:library.aiUsage,aiPeriod:library.aiPeriod,subscription:library.subscription}}
export async function findOwnerUser(id:string){safeId(id);const index=await listObjects('accounts/',MAX_USERS);const accounts=await mapLimit(index.objects,object=>readJSON<User>(object.pathname));const user=accounts.find(account=>account?.value.id===id)?.value;if(!user)throw new AppError(index.hasMore?'Аккаунт не найден в первых 1000 записях.':'Аккаунт не найден.',404);return user}
export async function ownerOverview():Promise<OwnerOverview>{
 const now=Date.now();const index=await listObjects('accounts/',MAX_USERS);let failed=0;
 const entries=await mapLimit(index.objects,async object=>{try{const user=(await readJSON<User>(object.pathname))?.value;if(!user?.id||!user.username||!user.createdAt){failed++;return null}const library=await getLibrary(user.id);return {user:safeOwnerUser(user,library,now),library}}catch{failed++;return null}});
 const data=entries.filter((entry):entry is NonNullable<typeof entry>=>!!entry);const users=data.map(entry=>entry.user).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 const totals={users:users.length,materials:0,ready:0,topics:0,chats:0,reviews:0,fileBytes:0,reservedBytes:0,aiToday:0};for(const user of users)for(const key of ['materials','ready','topics','chats','reviews','fileBytes','reservedBytes','aiToday'] as const)totals[key]+=user[key];
 const registrations=Array.from({length:7},(_,index)=>({day:new Date(now-(6-index)*86400000).toISOString().slice(0,10),count:0}));for(const user of users){const day=registrations.find(item=>item.day===user.createdAt.slice(0,10));if(day)day.count++}
 const kinds=Object.entries(data.flatMap(entry=>entry.library.materials).reduce((result,item)=>{result[item.kind]=(result[item.kind]||0)+1;return result},{} as Record<string,number>)).map(([kind,count])=>({kind:kind as Library['materials'][number]['kind'],count}));
 return {updatedAt:new Date(now).toISOString(),complete:!index.hasMore&&!failed,accountObjects:index.objects.length,loadedUsers:users.length,warnings:[...(index.hasMore?['Показаны первые 1000 аккаунтов. Итоги неполные.']:[]),...(failed?[`${failed} записей не удалось прочитать. Итоги неполные.`]:[])],users,totals,registrations,kinds};
}
export async function ownerDetail(id:string):Promise<OwnerDetail>{const user=await findOwnerUser(id);const library=await getLibrary(user.id);return {user:safeOwnerUser(user,library),library:safeOwnerLibrary(library)}}
export async function ownerContent(uid:string,kind:string,id:string):Promise<OwnerContent>{await findOwnerUser(uid);if(kind==='material'){const {filePath:_,...content}=(await getMaterial(uid,id)).value;return {kind,content}}if(kind==='chat')return {kind,content:(await getChat(uid,id)).value};throw new AppError('Неизвестный тип записи.',404)}
export async function ownerOrders(){const index=await listObjects('billing/orders/',1000);const records=await mapLimit(index.objects,object=>readJSON<BillingOrder>(object.pathname));const orders=records.flatMap(record=>record?[record.value]:[]).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return {orders,complete:!index.hasMore,updatedAt:new Date().toISOString()}}

const healthPath='operations/health.json';
export async function ownerHealth(live=false):Promise<OwnerHealth>{
 const checks:HealthCheck[]=[];const checkedAt=new Date().toISOString();const saved=await readJSON<{history:OwnerHealth['history']}>(healthPath).catch(()=>null);
 const storageStart=Date.now();try{const owner=await readObject('operations/owner.json');const accounts=await listObjects('accounts/',1);checks.push({name:'Хранилище',status:'ok',detail:`Чтение и список доступны. ${accounts.objects.length?'Аккаунты найдены.':'Пока нет аккаунтов.'}${owner?' Профиль владельца закреплён.':''}`,latencyMs:Date.now()-storageStart})}catch{checks.push({name:'Хранилище',status:'error',detail:'Не удалось прочитать хранилище.',latencyMs:Date.now()-storageStart})}
 checks.push({name:'Вход и права',status:process.env.AUTH_SECRET&&ownerConfigured()?'ok':'unconfigured',detail:process.env.AUTH_SECRET&&ownerConfigured()?'Сессия проверена сервером; доступ разрешён владельцу.':'Проверьте серверную настройку входа и владельца.'});
 if(!aiAvailable())checks.push({name:'Искусственный интеллект',status:'unconfigured',detail:'Провайдер ИИ не настроен.'});
 else if(live&&process.env.GOOGLE_GENERATIVE_AI_API_KEY){const started=Date.now();try{const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models',{headers:{'x-goog-api-key':process.env.GOOGLE_GENERATIVE_AI_API_KEY},cache:'no-store',signal:AbortSignal.timeout(10000)});checks.push({name:'Искусственный интеллект',status:response.ok?'ok':'error',detail:response.ok?'Gemini подтвердил ключ; список моделей доступен. Генерация и квоты не проверялись.':`Gemini отклонил проверку: HTTP ${response.status}.`,latencyMs:Date.now()-started})}catch{checks.push({name:'Искусственный интеллект',status:'error',detail:'Gemini не ответил на проверку.',latencyMs:Date.now()-started})}}
 else checks.push({name:'Искусственный интеллект',status:'warning',detail:'Провайдер настроен. Запустите проверку соединения; генерация не выполняется.'});
 if(!billingConfigured())checks.push({name:'ЮKassa',status:'unconfigured',detail:'Ключ или номер магазина не настроен.'});
 else if(live){const started=Date.now();try{const result=await billingHealthCheck();checks.push({name:'ЮKassa',status:'ok',detail:`Магазин ${result.shopId}: ключ подтверждён. ${billingEnabled()?(billingTest()?'Тестовая оплата включена.':'Приём платежей включён.'):'Приём платежей отключён.'}`,latencyMs:Date.now()-started})}catch{checks.push({name:'ЮKassa',status:'error',detail:'ЮKassa не подтвердила ключ магазина. Проверьте подключение.',latencyMs:Date.now()-started})}}
 else checks.push({name:'ЮKassa',status:'warning',detail:`Настройки присутствуют; соединение ещё не проверено. Приём платежей ${billingEnabled()?'включён':'отключён'}.`});
 let history=saved?.value.history||[];if(live){history=[{checkedAt,ok:checks.filter(check=>check.status==='ok').length,issues:checks.filter(check=>check.status!=='ok').length},...history].slice(0,20);try{await writeObject(healthPath,JSON.stringify({history}))}catch{checks.push({name:'История проверок',status:'error',detail:'Результат показан, но историю не удалось сохранить.'})}}
 return {checkedAt,live,checks,history};
}
