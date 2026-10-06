import {requireOwner} from '@/lib/admin-auth';
import {ownerOverview,ownerDetail,ownerContent,ownerHealth,ownerOrders} from '@/lib/admin-data';
import {AppError,listObjects,writeObject,safeId} from '@/lib/storage';
import {checkOrigin,consumeLimit} from '@/lib/auth';
import {json,route,body} from '@/lib/http';
import {receiptSent} from '@/lib/billing';
import {randomUUID} from 'node:crypto';

export const dynamic='force-dynamic';
export const maxDuration=60;
type Context={params:Promise<{path:string[]}>};
export async function GET(request:Request,context:Context){return route(async()=>{
 await requireOwner();const {path}=await context.params;const url=new URL(request.url);
 if(path.length===1&&path[0]==='overview')return json(await ownerOverview());
 if(path.length===1&&path[0]==='health')return json(await ownerHealth());
 if(path.length===1&&path[0]==='billing')return json(await ownerOrders());
 if(path.length===1&&path[0]==='storage'){
  const prefix=url.searchParams.get('prefix')||'';if(!['','users/','accounts/','billing/','operations/','limits/'].includes(prefix))throw new AppError('Неизвестный раздел хранилища.');
  const cursor=url.searchParams.get('cursor')||undefined;if(cursor&&cursor.length>2000)throw new AppError('Некорректная страница.');
  const result=await listObjects(prefix,100,cursor);return json({...result,pageBytes:result.objects.reduce((sum,object)=>sum+object.size,0)});
 }
 if(path[0]==='users'&&path.length===2)return json(await ownerDetail(path[1]));
 if(path[0]==='users'&&path.length===3&&path[2]==='export'){
  const data=await ownerDetail(path[1]);return new Response(JSON.stringify({...data,exportedAt:new Date().toISOString(),scope:'Account metadata and library index; open individual lectures or chats for their full JSON.'},null,2),{headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','Content-Disposition':`attachment; filename="polka-library-${safeId(path[1])}.json"`}});
 }
 if(path[0]==='users'&&path.length===4)return json(await ownerContent(path[1],path[2],path[3]));
 throw new AppError('Раздел не найден.',404);
})}
export async function POST(request:Request,context:Context){return route(async()=>{
 const owner=await requireOwner();checkOrigin(request);const {path}=await context.params;
 if(path.length===1&&path[0]==='health'){await consumeLimit('owner-health:'+owner.id,6,3600000);return json(await ownerHealth(true))}
 if(path.length===2&&path[0]==='receipts'){
  const input=await body(request);if(input.confirmed!==true)throw new AppError('Подтвердите, что чек уже сформирован и отправлен.');
  const result=await receiptSent(safeId(path[1]));await writeObject(`operations/audit/${randomUUID()}.json`,JSON.stringify({action:'receipt_marked_sent',ownerId:owner.id,orderId:path[1],createdAt:new Date().toISOString()}),{createOnly:true});return json(result);
 }
 throw new AppError('Действие не найдено.',404);
})}
