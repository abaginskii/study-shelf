import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {runInNewContext} from 'node:vm';

test('PWA caches public offline assets only and ships valid install icons',async()=>{
 const origin='https://polka.test';
 const publicDir=resolve(process.cwd(),'public');
 const listeners=new Map<string,(event:Record<string,unknown>)=>void>();
 const precached:Request[]=[];
 const writes:unknown[]=[];
 const matches:string[]=[];
 const fetched:unknown[]=[];
 const offline=new Response('Public offline page',{headers:{'Content-Type':'text/html'}});
 let connected=true;
 let hasOfflinePage=true;
 class BrowserRequest extends Request {
  constructor(input:string|Request,init?:RequestInit){super(typeof input==='string'?new URL(input,origin):input,init)}
 }
 const cache={
  add:async(request:Request)=>{precached.push(request)},
  put:async(...args:unknown[])=>{writes.push(args)},
 };
 const caches={
  open:async()=>cache,
  keys:async()=>[],
  delete:async()=>true,
  match:async(input:string|Request)=>{
   const path=new URL(typeof input==='string'?input:input.url,origin).pathname;
   matches.push(path);
   return path==='/offline.html'&&hasOfflinePage?offline:undefined;
  },
 };
 runInNewContext(await readFile(resolve(publicDir,'sw.js'),'utf8'),{
  self:{location:{origin},addEventListener:(name:string,listener:(event:Record<string,unknown>)=>void)=>listeners.set(name,listener),skipWaiting:async()=>{},clients:{claim:async()=>{}}},
  caches,Request:BrowserRequest,Response,URL,
  fetch:async(request:unknown)=>{fetched.push(request);if(!connected)throw new TypeError('Offline');return new Response('Private signed-in navigation')},
 });
 assert.ok(listeners.has('install'));
 assert.ok(listeners.has('fetch'));
 const installation:Promise<unknown>[]=[];
 listeners.get('install')!({waitUntil:(promise:Promise<unknown>)=>installation.push(promise)});
 await Promise.all(installation);
 assert.ok(precached.some(request=>new URL(request.url).pathname==='/offline.html'));
 for(const request of precached){
  const path=new URL(request.url).pathname;
  assert.ok(path==='/offline.html'||path.startsWith('/icons/'),`Unexpected precached path: ${path}`);
  assert.notEqual(path,'/');
  assert.ok(!path.startsWith('/api'));
  assert.equal(request.credentials,'omit');
 }

 function dispatch(path:string,method='GET',mode='navigate'){
  const responses:Promise<Response>[]=[];
  listeners.get('fetch')!({request:{url:new URL(path,origin).href,method,mode},respondWith:(response:Response|Promise<Response>)=>responses.push(Promise.resolve(response))});
  return responses;
 }
 for(const path of ['/api','/api/account','/api/chats','/api/materials/35b076a3-b5b3-4cad-961d-38da102e2fbb/file']){
  assert.equal(dispatch(path).length,0,`Private API was intercepted: ${path}`);
 }
 assert.equal(dispatch('/','POST').length,0);
 assert.equal(dispatch('/api/chat','POST').length,0);
 assert.equal(dispatch('https://other.test/private').length,0);
 assert.equal(dispatch('/icons/icon-192.png?account=private','GET','cors').length,0);
 assert.equal(fetched.length,0);
 assert.equal(matches.length,0);

 const cachedBeforeNavigation=precached.length;
 const online=dispatch('/?chat=private-history');
 assert.equal(online.length,1);
 assert.equal(await (await online[0]).text(),'Private signed-in navigation');
 assert.equal(precached.length,cachedBeforeNavigation);
 assert.equal(writes.length,0);
 assert.equal(matches.length,0);
 connected=false;
 const fallback=dispatch('/?chat=private-history');
 assert.equal(fallback.length,1);
 assert.equal(await fallback[0],offline);
 assert.deepEqual(matches,['/offline.html']);
 assert.equal(writes.length,0);
 assert.equal(precached.length,cachedBeforeNavigation);
 hasOfflinePage=false;
 const missingFallback=await dispatch('/')[0];
 assert.equal(missingFallback.status,503);
 assert.deepEqual(matches,['/offline.html','/offline.html']);
 assert.equal(writes.length,0);

 const manifest=JSON.parse(await readFile(resolve(publicDir,'manifest.webmanifest'),'utf8')) as {display:string;icons:{src:string;sizes:string;type:string;purpose:string}[]};
 assert.equal(manifest.display,'standalone');
 assert.ok(manifest.icons.some(icon=>icon.sizes==='192x192'));
 assert.ok(manifest.icons.some(icon=>icon.sizes==='512x512'&&icon.purpose==='maskable'));
 for(const icon of manifest.icons){
  assert.match(icon.src,/^\/icons\/[a-z0-9-]+\.png$/);
  assert.equal(icon.type,'image/png');
  const png=await readFile(resolve(publicDir,icon.src.slice(1)));
  assert.ok(png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
  assert.equal(png.subarray(12,16).toString(),'IHDR');
  assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`,icon.sizes);
 }
});
