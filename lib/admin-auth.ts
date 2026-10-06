import {currentUser} from './auth';
import {AppError,readJSON,writeObject} from './storage';
import type {User} from './types';

const ownerPath='operations/owner.json';
export const ownerConfigured=()=>!!(process.env.OWNER_USER_ID?.trim()||process.env.OWNER_USERNAME?.trim());
export async function authorizeOwner(user:User|null):Promise<User>{
 if(!user)throw new AppError('Войдите в аккаунт владельца.',401);
 const id=process.env.OWNER_USER_ID?.trim();
 if(id){if(user.id!==id)throw new AppError('Доступ только для владельца.',403);return user}
 const name=process.env.OWNER_USERNAME?.trim();if(!name)throw new AppError('Доступ только для владельца.',403);
 let owner=await readJSON<{id:string;enrolledAt:string}>(ownerPath);
 if(!owner){if(user.username!==name)throw new AppError('Доступ только для владельца.',403);try{await writeObject(ownerPath,JSON.stringify({id:user.id,enrolledAt:new Date().toISOString()}),{createOnly:true})}catch(error){if(!(error instanceof AppError)||error.status!==409)throw error}owner=await readJSON<{id:string;enrolledAt:string}>(ownerPath)}
 if(owner?.value.id!==user.id)throw new AppError('Доступ только для владельца.',403);
 return user;
}
export async function requireOwner(){return authorizeOwner(await currentUser())}
export async function isOwner(){try{await requireOwner();return true}catch{return false}}
