import {currentUser,publicUser} from '@/lib/auth';
import {storageReady} from '@/lib/storage';
import {json} from '@/lib/http';
import {aiAvailable} from '@/lib/ai';
import {mobilePilotEligible} from '@/lib/mobile-pilot';
export const dynamic='force-dynamic';
export async function GET(){const user=await currentUser();return json({user:user?publicUser(user):null,storageReady:storageReady()&&(process.env.AUTH_SECRET?.length||0)>=32,aiAvailable:aiAvailable(),mobilePilotEligible:await mobilePilotEligible(user)})}
