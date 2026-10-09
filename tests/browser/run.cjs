const { spawn, spawnSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const scratch = mkdtempSync(join(tmpdir(), 'polka-v2-run-'));
const fixtureFile = join(scratch, 'fixture.json');
const port = process.env.POLKA_TEST_PORT || '3110';
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, VERCEL: '', AUTH_SECRET: 'polka-v2-local-test-secret-not-production-2026', OWNER_USERNAME: 'artem', OWNER_USER_ID: '', GOOGLE_GENERATIVE_AI_API_KEY: '', BLOB_READ_WRITE_TOKEN: '', BLOB_STORE_ID: '', POLKA_TEST_FIXTURE: fixtureFile, POLKA_TEST_URL: base };
let server, fixture;
async function run() {
  const seed = spawnSync(process.execPath, ['--import', 'tsx', 'tests/browser/seed.ts'], { env, stdio: 'inherit' });
  if (seed.status !== 0) throw new Error('Fixture seed failed');
  fixture = JSON.parse(readFileSync(fixtureFile, 'utf8'));
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', process.env.POLKA_TEST_PRODUCTION === '1' ? 'start' : 'dev', '--port', port, '--hostname', '127.0.0.1'], { env: { ...env, LOCAL_DATA_DIR: fixture.dir }, stdio: 'inherit' });
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error('Local test server exited');
    try { const response = await fetch(`${base}/api/session`, { signal: AbortSignal.timeout(2000) }); if (response.ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Local test server did not become ready');
  const status = await new Promise((resolve, reject) => {
    const test = spawn(process.execPath, ['tests/browser/design-v2.cjs'], { env, stdio: 'inherit' });
    test.on('error', reject); test.on('exit', code => resolve(code));
  });
  if (status !== 0) throw new Error('Browser verification failed');
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (server && server.exitCode === null) {
    await new Promise(resolve => {
      const timer = setTimeout(() => { server.kill('SIGKILL'); }, 5000);
      server.once('exit', () => { clearTimeout(timer); resolve(); });
      server.kill('SIGTERM');
    });
  }
  if (fixture) rmSync(fixture.dir, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
});
