import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { designPreviewEligible } from '../lib/design-preview';
import type { User } from '../lib/types';

test('design pilot is restricted to the pinned artem owner and fails closed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'polka-design-'));
  const old = { dir: process.env.LOCAL_DATA_DIR, name: process.env.OWNER_USERNAME, id: process.env.OWNER_USER_ID };
  process.env.LOCAL_DATA_DIR = dir;
  process.env.OWNER_USERNAME = 'artem';
  delete process.env.OWNER_USER_ID;
  const user: User = { id: 'owner-design-test', username: 'artem', passwordHash: '', recoveryHash: '', createdAt: new Date().toISOString(), version: 1 };
  try {
    assert.equal(await designPreviewEligible(null), false);
    assert.equal(await designPreviewEligible({ ...user, username: 'student' }), false);
    assert.equal(await designPreviewEligible(user), true);
    assert.equal(await designPreviewEligible({ ...user, id: 'different-account' }), false);
    process.env.OWNER_USER_ID = 'different-account';
    assert.equal(await designPreviewEligible(user), false);
    delete process.env.OWNER_USER_ID;
    delete process.env.OWNER_USERNAME;
    assert.equal(await designPreviewEligible(user), false);
  } finally {
    for (const [key, value] of Object.entries({ LOCAL_DATA_DIR: old.dir, OWNER_USERNAME: old.name, OWNER_USER_ID: old.id })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(dir, { recursive: true, force: true });
  }
});
