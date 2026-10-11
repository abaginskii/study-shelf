const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
async function verifyPilotBilling(browser,base,screenshots){
 assert(['localhost','127.0.0.1'].includes(new URL(base).hostname));
 const ctx=await browser.newContext({serviceWorkers:'block'});const page=await ctx.newPage();
 try{
  const response=await ctx.request.post(base+'/api/auth',{data:{action:'login',username:'artem',password:'polka-design-test-only-2026'}});assert.equal(response.status(),200);
  await ctx.addCookies((await ctx.cookies()).map(cookie=>({...cookie,secure:false})));
  const account=await (await ctx.request.get(base+'/api/account')).json();
  assert.equal(account.owner,true);assert.equal(account.usage.storage.limit,10*1024**3);assert.equal(account.usage.ai.limit,200);assert.equal(account.usage.ai.periodLimit,6000);assert.equal(account.usage.materials.limit,10000);
  console.log('PASS Billing: real local account API exposes owner allowances');
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:900});await page.goto(base+'/pricing');
   assert.match(await page.locator('.plan-price').innerText(),/50 ₽/);assert.match(await page.locator('.pricing-status').innerText(),/Продажи ещё не открыты/);
   await page.goto(base+'/checkout');await page.getByRole('heading',{name:'Оформление скоро откроется'}).waitFor();assert.match(await page.locator('.checkout-price').innerText(),/50 ₽/);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`${screenshots}/pilot-checkout-${width}.png`,fullPage:true});
  }
  console.log('PASS Billing: pilot 50 RUB price and honest disabled checkout fit mobile and desktop');
  // Explicit UI fixture only: no provider requests or payment creation.
  const orderId=randomUUID();await page.route('**/api/billing/orders/'+orderId,route=>route.fulfill({json:{order:{id:orderId,status:'pending',amount:'399.00',periodDays:30,test:false}}}));
  await page.goto(base+'/checkout?order='+orderId);await page.getByRole('heading',{name:'Ждём подтверждения оплаты'}).waitFor();assert.match(await page.locator('.checkout-price').innerText(),/399 ₽/);
  console.log('PASS Billing: a historical pending order displays its captured price without claiming success');
  await page.route('**/api/billing/config',route=>route.fulfill({json:{enabled:true,test:true}}));
  await page.goto(base+'/checkout');await page.getByRole('heading',{name:'Тестовое оформление'}).waitFor();assert.match(await page.getByRole('status').innerText(),/без списания/);assert.equal(await page.getByRole('button',{name:'Перейти в ЮKassa · 50 ₽'}).isDisabled(),true);
  await page.screenshot({path:`${screenshots}/sandbox-checkout-390.png`,fullPage:true});
  await page.unroute('**/api/billing/orders/'+orderId);
  await page.route('**/api/billing/orders/'+orderId,route=>route.fulfill({json:{order:{id:orderId,status:'succeeded',amount:'50.00',periodDays:30,test:true}}}));
  await page.goto(base+'/checkout?order='+orderId);await page.getByRole('heading',{name:'Тест пройден'}).waitFor();assert.match(await page.locator('.checkout-form-card').innerText(),/реальные деньги не списывались/);assert.doesNotMatch(await page.locator('.checkout-form-card').innerText(),/Чек НПД будет отправлен/);
  console.log('PASS Billing: explicit sandbox form and verified-success UI distinguish test access from a real charge');
  return 4;
 }finally{await ctx.close()}
}
module.exports={verifyPilotBilling};
