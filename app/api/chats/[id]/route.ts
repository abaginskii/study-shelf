import {requireUser,checkOrigin} from '@/lib/auth';
import {getChat,mutateChat,deleteChat} from '@/lib/storage';
import {json,route} from '@/lib/http';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export async function GET(_:Request,{params}:Context){return route(async()=>{const user=await requireUser();const {id}=await params;let chat=(await getChat(user.id,id)).value;if(chat.pending&&chat.pending.startedAt<Date.now()-150000)chat=await mutateChat(user.id,id,latest=>{if(latest.pending&&latest.pending.startedAt<Date.now()-150000){latest.status='failed';latest.error='Ответ был прерван. Повторите запрос.';latest.pending=undefined}});return json({chat})})}
export async function DELETE(request:Request,{params}:Context){return route(async()=>{checkOrigin(request);const user=await requireUser();const {id}=await params;await deleteChat(user.id,id);return json({ok:true})})}
