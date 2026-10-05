import {checkOrigin,clearSession} from '@/lib/auth';import {json,route} from '@/lib/http';
export async function POST(request:Request){return route(async()=>{checkOrigin(request);await clearSession();return json({ok:true})})}
