import {requireUser,checkOrigin,consumeLimit,rateKey} from '@/lib/auth';
import {body,json,route} from '@/lib/http';
import {createCheckout,ownedOrder,syncOrder,publicOrder,receiveBillingEvent,billingEnabled,billingTest} from '@/lib/billing';
import {PLAN} from '@/lib/plans';
import {getLibrary,AppError} from '@/lib/storage';
export const dynamic='force-dynamic';export const maxDuration=60;
type Context={params:Promise<{path:string[]}>};
export async function GET(request:Request,context:Context){return route(async()=>{
 const {path}=await context.params;if(path[0]==='config')return json({enabled:billingEnabled(),test:billingTest(),plan:PLAN});
 const user=await requireUser();await consumeLimit('billing-read:'+user.id,30,60000);
 if(path[0]==='orders'&&!path[1]){const ids=(await getLibrary(user.id)).paymentOrders?.slice(-20).reverse()||[];return json({orders:await Promise.all(ids.map(async id=>publicOrder(await ownedOrder(user.id,id))))})}
 if(path[0]==='orders'&&path[1])return json({order:publicOrder(await syncOrder(await ownedOrder(user.id,path[1])))});
 throw new AppError('Не найдено',404);
})}
export async function POST(request:Request,context:Context){return route(async()=>{
 const {path}=await context.params;
 if(path[0]==='webhook'){
  await consumeLimit('billing-webhook:'+rateKey(request),120,60000);
  const input=await body(request);if(input.type!=='notification')return json({error:'Неизвестное уведомление'},400);
  // A caller-supplied status never grants access: fetch the authenticated provider object instead.
  await receiveBillingEvent(input.event,input.object);return json({received:true});
 }
 checkOrigin(request);const user=await requireUser();
 if(path[0]==='checkout'){await consumeLimit('billing-create:'+user.id,20,86400000);const input=await body(request);return json({order:publicOrder(await createCheckout(user,{requestId:String(input.requestId||''),email:String(input.email||''),acceptedOffer:input.acceptedOffer===true}))})}
 return json({error:'Не найдено'},404);
})}
