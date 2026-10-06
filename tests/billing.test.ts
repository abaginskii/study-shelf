import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCheckout,receiveBillingEvent,ownedOrder,subscriptionAccess,requireStudyAccess,grantOrder,publicOrder,syncOrder,type BillingOrder} from '../lib/billing';
import {getLibrary} from '../lib/storage';
import type {User} from '../lib/types';
test('YooKassa checkout is idempotent; verified payments grant once; spoofed callbacks and refunds cannot create access',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'polka-billing-'));process.env.LOCAL_DATA_DIR=dir;delete process.env.VERCEL;process.env.YOOKASSA_SHOP_ID='42';process.env.YOOKASSA_SECRET_KEY='unit-test-placeholder';process.env.YOOKASSA_ENABLED='true';process.env.YOOKASSA_TEST_MODE='false';
 const user:User={id:randomUUID(),username:'alice',createdAt:new Date().toISOString(),passwordHash:'private',recoveryHash:'private',version:1};const requestId=randomUUID();const payments=new Map<string,any>(),keys=new Map<string,string>(),refunds=new Map<string,any>();const original=globalThis.fetch;let createCalls=0;
 globalThis.fetch=async(input,options)=>{
  const url=String(input);assert.ok(url.startsWith('https://api.yookassa.ru/v3/'));assert.ok((options?.headers as Record<string,string>).Authorization.startsWith('Basic '));
  if(options?.method==='POST'){
   createCalls++;const data=JSON.parse(String(options.body));assert.equal(data.amount.value,'399.00');assert.equal(data.amount.currency,'RUB');assert.equal(data.capture,true);assert.equal(data.save_payment_method,false);assert.ok(!data.receipt);assert.ok(!data.payment_method_data);assert.ok(data.confirmation.return_url.startsWith('https://study-shelf-three.vercel.app/checkout?order='));
   const key=(options.headers as Record<string,string>)['Idempotence-Key'];let id=keys.get(key);if(!id){id=randomUUID();keys.set(key,id);payments.set(id,{id,status:'pending',paid:false,test:false,amount:data.amount,metadata:data.metadata,recipient:{account_id:'42'},confirmation:{confirmation_url:'https://yoomoney.ru/checkout/'+id}})}return Response.json(payments.get(id));
  }
  const id=url.split('/').at(-1)!;if(url.includes('/refunds/'))return Response.json(refunds.get(id));return payments.has(id)?Response.json(payments.get(id)):Response.json({error:'not_found'},{status:404});
 };
 try{
  const orders=await Promise.all([createCheckout(user,{requestId,email:'alice@example.ru',acceptedOffer:true}),createCheckout(user,{requestId,email:'alice@example.ru',acceptedOffer:true})]);assert.equal(orders[0].paymentId,orders[1].paymentId);assert.equal(keys.size,1);assert.equal((await getLibrary(user.id)).paymentOrders?.length,1);assert.equal(subscriptionAccess(await getLibrary(user.id)).paid,false);
  const payment=payments.get(orders[0].paymentId!);await receiveBillingEvent('payment.succeeded',{id:payment.id,metadata:payment.metadata});assert.equal(subscriptionAccess(await getLibrary(user.id)).paid,false,'callback text cannot override provider pending');
  payment.status='succeeded';payment.paid=true;
  await Promise.all([receiveBillingEvent('payment.succeeded',{id:payment.id}),receiveBillingEvent('payment.succeeded',{id:payment.id}),syncOrder(orders[0])]);let library=await getLibrary(user.id);assert.equal(library.subscription?.periods.length,1);assert.equal(subscriptionAccess(library).paid,true);assert.equal(library.aiPeriod?.count,0);
  const period=library.subscription!.periods[0];assert.equal(Date.parse(period.originalEndsAt)-Date.parse(period.startsAt),30*86400000);
  await assert.rejects(ownedOrder(randomUUID(),requestId),/не найден/);assert.ok(!JSON.stringify(publicOrder(await ownedOrder(user.id,requestId))).includes('alice@example.ru'));
  const bad=structuredClone(payment);bad.amount.value='1.00';payments.set(payment.id,bad);await assert.rejects(syncOrder(orders[0]),/соответствует/);payments.set(payment.id,payment);
  const partial={id:randomUUID(),payment_id:payment.id,status:'succeeded',amount:{value:'100.00',currency:'RUB'}};refunds.set(partial.id,partial);await Promise.all([receiveBillingEvent('refund.succeeded',{id:partial.id}),receiveBillingEvent('refund.succeeded',{id:partial.id})]);library=await getLibrary(user.id);assert.equal(library.subscription!.periods[0].refundedRub,100);assert.equal((await ownedOrder(user.id,requestId)).refunds?.length,1);
  const remaining={id:randomUUID(),payment_id:payment.id,status:'succeeded',amount:{value:'299.00',currency:'RUB'}};refunds.set(remaining.id,remaining);
  payment.refunded_amount={value:'399.00',currency:'RUB'};await syncOrder(orders[0]);library=await getLibrary(user.id);assert.equal(subscriptionAccess(library).paid,false,'canonical refund removes access even without webhook');assert.throws(()=>requireStudyAccess(library),/завершён/);
  await receiveBillingEvent('refund.succeeded',{id:remaining.id});assert.equal((await getLibrary(user.id)).subscription!.periods[0].refundedRub,399,'callback after reconciliation does not double count');
  await syncOrder(orders[0]);assert.equal((await ownedOrder(user.id,requestId)).status,'refunded');assert.equal(subscriptionAccess(await getLibrary(user.id)).paid,false,'late succeeded callback cannot revive refunded access');
  const before=createCalls;await assert.rejects(createCheckout(user,{requestId:randomUUID(),email:'bad',acceptedOffer:true}));await assert.rejects(createCheckout(user,{requestId:randomUUID(),email:'alice@example.ru',acceptedOffer:false}));process.env.YOOKASSA_ENABLED='false';await assert.rejects(createCheckout(user,{requestId:randomUUID(),email:'alice@example.ru',acceptedOffer:true}),/открыт/);assert.equal(createCalls,before);
 }finally{globalThis.fetch=original;delete process.env.LOCAL_DATA_DIR;delete process.env.YOOKASSA_SHOP_ID;delete process.env.YOOKASSA_SECRET_KEY;delete process.env.YOOKASSA_ENABLED;await rm(dir,{recursive:true,force:true})}
});
test('Manual renewal adds a future period instead of extending an order on replay',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'polka-renewal-'));process.env.LOCAL_DATA_DIR=dir;delete process.env.VERCEL;
 try{const base:BillingOrder={id:randomUUID(),userId:randomUUID(),username:'owner',contactEmail:'a@example.ru',amount:'399.00',currency:'RUB',periodDays:30,status:'succeeded',test:false,createdAt:new Date().toISOString(),offerAcceptedAt:new Date().toISOString(),offerVersion:'2026-10-06'};
  await grantOrder(base);await grantOrder(base);await grantOrder({...base,id:randomUUID()});const library=await getLibrary(base.userId);assert.equal(library.subscription?.periods.length,2);assert.equal(library.subscription!.periods[1].startsAt,library.subscription!.periods[0].endsAt);assert.equal(subscriptionAccess(library,Date.parse(library.subscription!.periods[1].startsAt)+1000).paid,true);assert.equal(subscriptionAccess(library,Date.parse(library.subscription!.periods[1].endsAt)).status,'expired');
  await grantOrder({...base,status:'refunded',canonicalRefundedRub:399});const revised=await getLibrary(base.userId);assert.equal(subscriptionAccess(revised).paid,true,'already paid renewal starts immediately after prior refund');assert.equal(Date.parse(revised.subscription!.periods[1].originalEndsAt)-Date.parse(revised.subscription!.periods[1].startsAt),30*86400000);assert.equal(revised.aiPeriod?.startedAt,revised.subscription!.periods[1].startsAt);
 }finally{delete process.env.LOCAL_DATA_DIR;await rm(dir,{recursive:true,force:true})}
});
