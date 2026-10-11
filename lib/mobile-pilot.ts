import type {User} from './types';
/** Presentation eligibility only. Data access and owner privileges are checked separately. */
export async function mobilePilotEligible(user:User|null):Promise<boolean>{return !!user}
