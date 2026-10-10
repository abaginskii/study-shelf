import {authorizeOwner} from './admin-auth';
import type {User} from './types';

/** Session metadata for the owner-only mobile UI; it grants no data permissions. */
export async function mobilePilotEligible(user:User|null):Promise<boolean>{
 if(!user||user.username!=='artem')return false;
 try{
  await authorizeOwner(user);
  return true;
 }catch{
  return false;
 }
}
