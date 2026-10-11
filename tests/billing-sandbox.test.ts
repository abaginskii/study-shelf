import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {billingConfigured,billingEnabled,createCheckout,syncOrder,subscriptionAccess,billingHealthCheck} from '../lib/billing';
import {getLibrary} from '../lib/storage';
import type {User} from '../lib/types';
test('sandbox cannot use live credentials; only verified test payments activate access and remain marked after mode switches',async()=>{
 const keys=['LOCAL_DATA_DIR','VERCEL','YOOKASSA_SHOP_ID','YOOKASSA_SECRET_KEY','YOOKASSA_TEST_SHOP_ID','YOOKASSA_TEST_SECRET_KEY','YOOKASSA_ENABLED','YOOKASSA_TEST_ENABLED','YOOKASSA_TEST_MODE'] as const;
 const before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));const original=globalThis.fetch;const dir=await mkdtemp(join(tmpdir(),'polka-sandbox-'));
 process.env.LOCAL_DATA_DIR=dir;delete process.env.VERCEL;process.env.YOOKASSA_SHOP_ID='42';process.env.YOOKASSA_SECRET_KEY='live_not_real';process.env.YOOKASSA_ENABLED='false';process.env.YOOKASSA_TEST_ENABLED='true';process.env.YOOKASSA_TEST_MODE='true';delete process.env.YOOKASSA_TEST_SECRET_KEY;
 const user:User={id:randomUUID(),username:'sandbox-user',createdAt:new Date().toISOString(),version:1,passwordHash:'fixture',recoveryHash:'fixture'};const input={requestId:randomUUID(),email:'sandbox@example.ru',acceptedOffer:true};let calls=0;let payment:any;
 globalThis.fetch=async(url,options)=>{calls++;assert.equal((options?.headers as Record<string,string>).Authorization,'Basic '+Buffer.from('1492209:test_fixture_only').toString('base64'));if(String(url).endsWith('/me'))return Response.json({account_id:'1492209',test:true});if(options?.method==='POST'){const data=JSON.parse(String(options.body));assert.equal(data.amount.value,'50.00');payment={id:randomUUID(),status:'pending',paid:false,test:true,amount:data.amount,metadata:data.metadata,recipient:{account_id:'1492209'},confirmation:{confirmation_url:'https://yoomoney.ru/checkout/test'}}}return Response.json(payment)};
 try{
  assert.equal(billingConfigured(),false);await assert.rejects(createCheckout(user,input),/открыт/);assert.equal(calls,0);
  process.env.YOOKASSA_TEST_SHOP_ID='1492209';process.env.YOOKASSA_TEST_SECRET_KEY='live_wrong';assert.equal(billingEnabled(),false);await assert.rejects(createCheckout(user,input));assert.equal(calls,0);
  process.env.YOOKASSA_TEST_SECRET_KEY='test_fixture_only';assert.equal((await billingHealthCheck()).test,true);
  const order=await createCheckout(user,input);assert.equal(order.test,true);assert.equal(subscriptionAccess(await getLibrary(user.id)).paid,false);
  payment.status='succeeded';payment.paid=true;payment.test=false;await assert.rejects(syncOrder(order),/соответствует/);assert.equal(subscriptionAccess(await getLibrary(user.id)).paid,false);
  payment.test=true;await syncOrder(order);await syncOrder(order);assert.equal((await getLibrary(user.id)).subscription?.periods.length,1);assert.equal(subscriptionAccess(await getLibrary(user.id)).test,true);
  process.env.YOOKASSA_TEST_MODE='false';assert.equal(billingEnabled(),false,'switching mode cannot open real sales');await syncOrder(order);assert.equal(subscriptionAccess(await getLibrary(user.id)).test,true,'test entitlement is marked by stored period, not global mode');
 }finally{globalThis.fetch=original;for(const key of keys){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key]}await rm(dir,{recursive:true,force:true})}
});
