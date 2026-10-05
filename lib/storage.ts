import {get,put,del,BlobPreconditionFailedError} from '@vercel/blob';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {emptyLibrary,type Library,type Material,type MaterialCard} from './types';
export class AppError extends Error {constructor(message:string,public status=400){super(message)}}
const local=()=>process.env.LOCAL_DATA_DIR && !process.env.VERCEL ? process.env.LOCAL_DATA_DIR : undefined;
export const storageReady=()=>!!(local()||process.env.BLOB_READ_WRITE_TOKEN||process.env.BLOB_STORE_ID);
const validPath=(path:string)=>{if(!/^[a-zA-Z0-9/_\-.]+$/.test(path)||path.includes('..'))throw new AppError('Некорректный путь');return path};
const sha=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
export async function readObject(path:string):Promise<{data:Buffer;etag:string}|null>{
 validPath(path);if(!storageReady())throw new AppError('Хранилище ещё не подключено. Попробуйте позже.',503);
 if(local()){try{const data=await readFile(join(local()!,path));return {data,etag:sha(data)}}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e}}
 const result=await get(path,{access:'private',useCache:false});
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
export async function saveMaterial(uid:string,m:Material,etag?:string,staged?:string){await writeObject(materialPath(uid,m.id),JSON.stringify(m),etag?{etag}:{createOnly:true});await mutateLibrary(uid,lib=>{const idx=lib.materials.findIndex(x=>x.id===m.id);if(idx<0){if(etag)throw new AppError('Материал уже удалён.',404);if(lib.materials.reduce((sum,x)=>sum+(x.size||0),0)+(lib.uploads||[]).filter(x=>x.pathname!==staged).reduce((sum,x)=>sum+x.size,0)+(m.size||0)>300*1024*1024)throw new AppError('Лимит хранилища: 300 МБ.');if(lib.materials.length>=100)throw new AppError('Достигнут лимит: 100 материалов. Удалите ненужные.');lib.materials.unshift(card(m))}else {if((lib.materials[idx].revision||1)>(m.revision||1))throw new AppError('Материал изменён в другой вкладке.',409);lib.materials[idx]=card(m)}if(staged)lib.uploads=(lib.uploads||[]).filter(x=>x.pathname!==staged)})}

export async function fileStream(path:string,range:string|null){validPath(path);if(local()){const result=await readObject(path);return result?{stream:new Response(new Uint8Array(result.data)).body,contentRange:null,size:result.data.length}:null}const result=await get(path,{access:'private',useCache:false,headers:range?{Range:range}:undefined});return result?.stream?{stream:result.stream,contentRange:result.headers.get('content-range'),size:Number(result.headers.get('content-length')||result.blob.size||0)}:null}
