import {createHash,randomUUID} from 'node:crypto';
import {AppError,mutateLibrary} from './storage';
import type {Library,SubjectFolder} from './types';
export const subjectColors=['violet','blue','mint','amber','rose'] as const;
export const subjectIcons=['book','code','math','globe','flask','music'] as const;
const key=(name:string)=>name.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru');
export function subjectFolders(library:Library){
 const folders=(library.subjects||[]).map(folder=>({...folder,aliases:[...folder.aliases]}));
 for(const material of library.materials){const name=material.subject||'Без предмета';if(!folders.some(folder=>[folder.name,...folder.aliases].some(alias=>key(alias)===key(name))))folders.push({id:'subject-'+createHash('sha256').update(key(name)).digest('hex').slice(0,24),name,aliases:[name],color:subjectColors[folders.length%subjectColors.length],icon:'book'})}
 return folders;
}
export function subjectNameMap(library:Library){const names=new Map<string,string>();for(const folder of subjectFolders(library))for(const alias of [folder.name,...folder.aliases])names.set(key(alias),folder.name);return names}
export function resolveSubjectName(library:Library,name:string,names=subjectNameMap(library)){return names.get(key(name||'Без предмета'))||name||'Без предмета'}
export async function changeSubject(uid:string,input:{id?:unknown;name?:unknown;color?:unknown;icon?:unknown},create=false){
 const name=String(input.name||'').trim().replace(/\s+/g,' ');if(!name||name.length>80)throw new AppError('Название предмета: от 1 до 80 символов.');
 const color=String(input.color||'violet'),icon=String(input.icon||'book');if(!subjectColors.includes(color as typeof subjectColors[number])||!subjectIcons.includes(icon as typeof subjectIcons[number]))throw new AppError('Выберите цвет и значок из списка.');
 const id=create?randomUUID():String(input.id||'');let result:SubjectFolder|undefined;
 await mutateLibrary(uid,library=>{
  const folders=subjectFolders(library);const existing=folders.find(folder=>folder.id===id);
  if(!create&&!existing)throw new AppError('Предмет не найден.',404);
  if(folders.some(folder=>folder.id!==id&&[folder.name,...folder.aliases].some(alias=>key(alias)===key(name))))throw new AppError('Предмет с таким названием уже есть.',409);
  if(create&&folders.length>=200)throw new AppError('Можно создать до 200 папок предметов.');
  result={id,name,color,icon,aliases:existing?Array.from(new Set([...existing.aliases,existing.name,name])):[name]};
  library.subjects=existing?folders.map(folder=>folder.id===id?result!:folder):[...folders,result];
 });return result!;
}
