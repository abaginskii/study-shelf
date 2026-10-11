import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mobilePilotEligible} from '../lib/mobile-pilot';
import type {User} from '../lib/types';
test('installed app UI is available to every authenticated user, never anonymous',async()=>{assert.equal(await mobilePilotEligible(null),false);for(const username of ['student','artem'])assert.equal(await mobilePilotEligible({username,id:username} as User),true)});
