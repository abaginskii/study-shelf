import {AppError,readJSON,writeObject,mutateLibrary,safeId} from './storage';
import {PLAN} from './plans';
import type {User,Library} from './types';
import {consumeLimit} from './auth';
export type BillingOrder={id:string;userId:string;username:string;contactEmail:string;amount:string;currency:'RUB';periodDays:number;createdAt:string;offerAcceptedAt:string;offerVersion:string;status:'created'|'pending'|'succeeded'|'canceled'|'refunded';paymentId?:string;confirmationUrl?:string;test:boolean;refunds?:{id:string;amount:string}[];canonicalRefundedRub?:number;receiptSentAt?:string};
type Payment={id:string;status:string;paid:boolean;test:boolean;amount:{value:string;currency:string};metadata?:Record<string,string>;recipient?:{account_id:string};confirmation?:{confirmation_url?:string};refunded_amount?:{value:string;currency:string}};
type Refund={id:string;payment_id:string;status:string;amount:{value:string;currency:string}};
const orderPath=(id:string)=>`billing/orders/${safeId(id)}.json`;
const mapPath=(id:string)=>`billing/payments/${safeId(id)}.json`;
export const billingConfigured=()=>/^\d+$/.test(process.env.YOOKASSA_SHOP_ID||'')&&!!process.env.YOOKASSA_SECRET_KEY;
export const billingEnabled=()=>billingConfigured()&&process.env.YOOKASSA_ENABLED==='true';
export const billingTest=()=>process.env.YOOKASSA_TEST_MODE==='true';
export async function billingHealthCheck(){const result=await yooRequest<{account_id:string|number;status?:string;test?:boolean}>('/me');if(String(result.account_id)!==process.env.YOOKASSA_SHOP_ID)throw new AppError('Ключ относится к другому магазину.',409);return {ok:true,shopId:String(result.account_id),status:result.status||null,test:result.test??billingTest(),checkedAt:new Date().toISOString()}}
const appUrl=()=>{const url=new URL(process.env.APP_URL||'https://study-shelf-three.vercel.app');if(url.protocol!=='https:')throw new AppError('Адрес оплаты не настроен.',503);return url.origin};
export async function yooRequest<T>(path:string,method='GET',data?:unknown,idempotenceKey?:string):Promise<T>{
 if(!billingConfigured())throw new AppError('Оплата ещё не подключена.',503);
 if(!/^\/(me|payments(?:\/[0-9a-f-]{36})?|refunds\/[0-9a-f-]{36})$/.test(path))throw new AppError('Некорректный запрос платежа.');
 let response:Response;try{response=await fetch('https://api.yookassa.ru/v3'+path,{method,headers:{Authorization:'Basic '+Buffer.from(process.env.YOOKASSA_SHOP_ID+':'+process.env.YOOKASSA_SECRET_KEY).toString('base64'),'Content-Type':'application/json',...(idempotenceKey?{'Idempotence-Key':idempotenceKey}:{})},body:data===undefined?undefined:JSON.stringify(data),cache:'no-store',signal:AbortSignal.timeout(20000)})}catch{throw new AppError('ЮKassa не ответила. Повторите этот же заказ; повторного списания не будет.',503)}
 if(!response.ok)throw new AppError(response.status===401?'Платёжный сервис не подтвердил подключение магазина.':'ЮKassa не выполнила запрос. Попробуйте позже или обратитесь в поддержку.',503);
 return await response.json() as T;
}
export function subscriptionAccess(library:Library,now=Date.now()){
 const periods=library.subscription?.periods||[];const active=periods.find(period=>Date.parse(period.startsAt)<=now&&Date.parse(period.endsAt)>now);
 const latest=[...periods].sort((a,b)=>b.endsAt.localeCompare(a.endsAt))[0];
 return {kind:periods.length?'subscription' as const:'pilot' as const,status:periods.length&&!active?'expired' as const:'active' as const,paid:!!active,billingEnabled:billingEnabled(),startsAt:active?.startsAt,endsAt:active?.endsAt||latest?.endsAt,test:billingTest()};
}
export function requireStudyAccess(library:Library){if(subscriptionAccess(library).status==='expired')throw new AppError('Оплаченный период завершён. Продлите доступ в аккаунте; чтение и экспорт сохранены.',402)}
const refundTotal=(order:BillingOrder)=>Math.min(Number(order.amount),Math.max(order.canonicalRefundedRub||0,(order.refunds||[]).reduce((sum,refund)=>sum+Number(refund.amount),0)));
export async function grantOrder(order:BillingOrder){
 if(order.status!=='succeeded'&&order.status!=='refunded')return;
 const refundedRub=refundTotal(order);
 await mutateLibrary(order.userId,library=>{
  library.subscription??={periods:[],updatedAt:new Date().toISOString()};let period=library.subscription.periods.find(item=>item.orderId===order.id);
  if(!period){
   const start=Math.max(Date.now(),...library.subscription.periods.map(item=>Date.parse(item.endsAt)));const startsAt=new Date(start).toISOString(),endsAt=new Date(start+order.periodDays*86400000).toISOString();
   period={orderId:order.id,startsAt,endsAt,originalEndsAt:endsAt,refundedRub:0};library.subscription.periods.push(period);
   // First paid period begins a fresh AI allowance. Renewal allowance starts when its period becomes active.
   if(start<=Date.now())library.aiPeriod={startedAt:startsAt,count:0};
  }
  if(refundedRub>period.refundedRub){
   period.refundedRub=refundedRub;period.endsAt=new Date(Math.max(Date.parse(period.startsAt),Date.parse(period.originalEndsAt)-Math.round(order.periodDays*86400000*refundedRub/Number(order.amount)))).toISOString();
   // Keep prepaid periods consecutive; never rewrite a period that has already begun.
   const periods=library.subscription.periods,now=Date.now();
   for(let index=periods.indexOf(period)+1;index<periods.length;index++){
    const next=periods[index],start=Date.parse(next.startsAt);if(start<=now)continue;
    const revisedStart=Math.max(now,Date.parse(periods[index-1].endsAt)),delta=revisedStart-start;
    if(delta<0){next.startsAt=new Date(revisedStart).toISOString();next.endsAt=new Date(Date.parse(next.endsAt)+delta).toISOString();next.originalEndsAt=new Date(Date.parse(next.originalEndsAt)+delta).toISOString()}
   }
   const active=periods.find(item=>Date.parse(item.startsAt)<=now&&Date.parse(item.endsAt)>now);
   if(active&&library.aiPeriod?.startedAt!==active.startsAt)library.aiPeriod={startedAt:active.startsAt,count:0};
  }
  library.subscription.updatedAt=new Date().toISOString();
 });
}
function verifiedPayment(order:BillingOrder,payment:Payment){
 if(!/^[0-9a-f-]{36}$/.test(payment.id)||(order.paymentId&&payment.id!==order.paymentId)||payment.amount?.value!==order.amount||payment.amount?.currency!==order.currency||payment.metadata?.order_id!==order.id||payment.metadata?.user_id!==order.userId||payment.metadata?.app!=='study-shelf'||String(payment.recipient?.account_id)!==process.env.YOOKASSA_SHOP_ID||payment.test!==order.test)throw new AppError('Платёж не соответствует заказу.',409);
}
function confirmationUrl(value:string|undefined){if(!value)return undefined;try{const url=new URL(value);if(url.protocol==='https:'&&(url.hostname==='yoomoney.ru'||url.hostname.endsWith('.yoomoney.ru')||url.hostname==='yookassa.ru'||url.hostname.endsWith('.yookassa.ru')))return url.toString()}catch{}throw new AppError('ЮKassa вернула неподдерживаемый адрес оплаты.',503)}
export async function savePayment(order:BillingOrder,payment:Payment){
 verifiedPayment(order,payment);let saved=order;
 for(let i=0;i<5;i++){const old=await readJSON<BillingOrder>(orderPath(order.id));if(!old)throw new AppError('Заказ не найден.',404);verifiedPayment(old.value,payment);
  const terminal=['succeeded','refunded'].includes(old.value.status);const status=terminal?old.value.status:payment.status==='succeeded'&&payment.paid?'succeeded':payment.status==='canceled'?'canceled':'pending';
  let canonicalRefundedRub=old.value.canonicalRefundedRub||0;
  if(payment.refunded_amount){const refunded=Number(payment.refunded_amount.value);if(payment.refunded_amount.currency!==order.currency||!Number.isFinite(refunded)||refunded<0||refunded>Number(order.amount))throw new AppError('Некорректная сумма возврата.',409);canonicalRefundedRub=Math.max(canonicalRefundedRub,refunded)}
  saved={...old.value,paymentId:payment.id,status,canonicalRefundedRub,confirmationUrl:confirmationUrl(payment.confirmation?.confirmation_url)||old.value.confirmationUrl};
  if(refundTotal(saved)>=Number(order.amount))saved.status='refunded';
  try{await writeObject(orderPath(order.id),JSON.stringify(saved),{etag:old.etag});break}catch(error){if(!(error instanceof AppError)||error.status!==409||i===4)throw error}
 }
 await writeObject(mapPath(payment.id),JSON.stringify({orderId:order.id}));await grantOrder(saved);return saved;
}
export async function createCheckout(user:User,input:{requestId:string;email:string;acceptedOffer:boolean}){
 if(!billingEnabled())throw new AppError('Приём платежей ещё не открыт.',503);safeId(input.requestId);
 const email=input.email.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw new AppError('Укажите email для чека.');if(input.acceptedOffer!==true)throw new AppError('Для покупки нужно принять оферту.');
 let stored=await readJSON<BillingOrder>(orderPath(input.requestId));
 if(!stored){const now=new Date().toISOString();const order:BillingOrder={id:input.requestId,userId:user.id,username:user.username,contactEmail:email,amount:PLAN.priceRub.toFixed(2),currency:'RUB',periodDays:PLAN.periodDays,createdAt:now,offerAcceptedAt:now,offerVersion:'2026-10-06',status:'created',test:billingTest()};
  // Reserve and bound the order index before a provider can receive any payment request.
  await mutateLibrary(user.id,library=>{library.paymentOrders??=[];if(library.paymentOrders.includes(order.id))return;if(library.paymentOrders.length>=250)throw new AppError('Достигнут предел истории заказов. Обратитесь в поддержку.');library.paymentOrders.push(order.id)});
  try{await writeObject(orderPath(order.id),JSON.stringify(order),{createOnly:true})}catch(error){if(!(error instanceof AppError)||error.status!==409)throw error}stored=await readJSON<BillingOrder>(orderPath(order.id));
 }
 if(!stored||stored.value.userId!==user.id)throw new AppError('Заказ не принадлежит вашему аккаунту.',403);
 const order=stored.value;if(order.contactEmail!==email)throw new AppError('Этот заказ создан с другим email. Начните новое оформление.',409);
 if(order.paymentId)return await syncOrder(order);
 if(Date.now()-Date.parse(order.createdAt)>23*3600000)throw new AppError('Срок оформления заказа истёк. Начните новый заказ.',409);
 const payment=await yooRequest<Payment>('/payments','POST',{amount:{value:order.amount,currency:order.currency},capture:true,confirmation:{type:'redirect',return_url:appUrl()+'/checkout?order='+order.id},description:`Полка: ${order.periodDays} дней доступа. Заказ ${order.id}`,save_payment_method:false,metadata:{app:'study-shelf',order_id:order.id,user_id:user.id}},order.id);
 return await savePayment(order,payment);
}
export async function ownedOrder(uid:string,id:string){const old=await readJSON<BillingOrder>(orderPath(id));if(!old||old.value.userId!==uid)throw new AppError('Заказ не найден.',404);return old.value}
export async function syncOrder(order:BillingOrder){if(!order.paymentId)return order;const payment=await yooRequest<Payment>('/payments/'+safeId(order.paymentId));return savePayment(order,payment)}
export function publicOrder(order:BillingOrder){return {id:order.id,status:order.status,amount:order.amount,currency:order.currency,periodDays:order.periodDays,createdAt:order.createdAt,confirmationUrl:order.status==='pending'?order.confirmationUrl:undefined,test:order.test,paymentId:order.paymentId,receiptSentAt:order.receiptSentAt}}
export async function receiveBillingEvent(event:string,object:{id?:string;payment_id?:string;metadata?:Record<string,string>}){
 if(!object?.id||!['payment.succeeded','payment.canceled','refund.succeeded'].includes(event))throw new AppError('Неподдерживаемое уведомление.');safeId(object.id);
 if(event.startsWith('payment.')){const mapped=await readJSON<{orderId:string}>(mapPath(object.id));const knownId=mapped?.value.orderId||object.metadata?.order_id;if(!knownId||!await readJSON<BillingOrder>(orderPath(knownId)))return;await consumeLimit('billing-event:'+object.id,20,60000);const payment=await yooRequest<Payment>('/payments/'+object.id);const id=payment.metadata?.order_id;if(payment.metadata?.app!=='study-shelf'||!id)return;const order=await readJSON<BillingOrder>(orderPath(id));if(!order)return;await savePayment(order.value,payment);return}
 await consumeLimit('billing-event:'+object.id,20,60000);
 const refund=await yooRequest<Refund>('/refunds/'+object.id);if(refund.id!==object.id||refund.status!=='succeeded')return;safeId(refund.payment_id);const payment=await yooRequest<Payment>('/payments/'+refund.payment_id);const id=payment.metadata?.order_id;if(payment.metadata?.app!=='study-shelf'||!id)return;
 let saved:BillingOrder|undefined;
 for(let i=0;i<5;i++){const old=await readJSON<BillingOrder>(orderPath(id));if(!old)return;verifiedPayment(old.value,payment);if(refund.amount.currency!=='RUB'||!Number.isFinite(Number(refund.amount.value))||Number(refund.amount.value)<=0||Number(refund.amount.value)>Number(old.value.amount))throw new AppError('Некорректный возврат.',409);
  const refunds=[...(old.value.refunds||[])];if(!refunds.some(item=>item.id===refund.id))refunds.push({id:refund.id,amount:refund.amount.value});if(refunds.length>50)throw new AppError('Предел истории возвратов.',409);
  saved={...old.value,refunds,status:'succeeded'};if(refundTotal(saved)>=Number(old.value.amount))saved.status='refunded';
  try{await writeObject(orderPath(id),JSON.stringify(saved),{etag:old.etag});break}catch(error){if(!(error instanceof AppError)||error.status!==409||i===4)throw error}
 }if(saved)await grantOrder(saved);
}
export async function receiptSent(id:string){for(let i=0;i<5;i++){const old=await readJSON<BillingOrder>(orderPath(id));if(!old||!['succeeded','refunded'].includes(old.value.status))throw new AppError('Успешный заказ не найден.',404);try{const value={...old.value,receiptSentAt:old.value.receiptSentAt||new Date().toISOString()};await writeObject(orderPath(id),JSON.stringify(value),{etag:old.etag});return publicOrder(value)}catch(error){if(!(error instanceof AppError)||error.status!==409||i===4)throw error}}}
