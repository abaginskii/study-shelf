import {requireUser} from '@/lib/auth';
import {getLibrary} from '@/lib/storage';
import {json,route} from '@/lib/http';
export const dynamic='force-dynamic';
export async function GET(){return route(async()=>{const user=await requireUser();const lib=await getLibrary(user.id);return json({chats:(lib.chats||[]).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))})})}
