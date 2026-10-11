import {checkOrigin,consumeLimit,requireUser} from '@/lib/auth';
import {changeSubject} from '@/lib/subjects';
import {body,json,route} from '@/lib/http';
async function update(request:Request,create:boolean){return route(async()=>{checkOrigin(request);const user=await requireUser();await consumeLimit('subjects:'+user.id,60,3600000);const input=await body(request);return json({subject:await changeSubject(user.id,input,create)},create?201:200)})}
export async function POST(request:Request){return update(request,true)}
export async function PATCH(request:Request){return update(request,false)}
