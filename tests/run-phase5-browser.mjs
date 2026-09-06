import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const url = 'http://127.0.0.1:3102';
try {
  await fetch(url, { signal: AbortSignal.timeout(1000) });
  throw new Error('Port 3102 is already in use. Stop that server before isolated tests.');
} catch (error) {
  if (error.message.includes('already in use')) throw error;
}
const server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--port', '3102', '--hostname', '127.0.0.1'], { stdio: 'inherit' });
const closed = once(server, 'exit');
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error('Test server exited before becoming ready.');
    try { ready = (await fetch(url, { signal: AbortSignal.timeout(1000) })).ok; } catch { /* wait for startup */ }
    if (ready) break;
    await delay(500);
  }
  if (!ready) throw new Error('Test server did not become ready.');
  const files = process.argv.includes('--full')
    ? ['tests/phase1-browser.mjs', 'tests/phase2-browser.mjs', 'tests/phase3-browser.mjs', 'tests/phase4-browser.mjs', 'tests/phase4-navigation.mjs', 'tests/phase5-browser.mjs', 'tests/phase5-maintenance-browser.mjs']
    : ['tests/phase5-browser.mjs', 'tests/phase5-maintenance-browser.mjs'];
  files.push('tests/phase5-catalog-browser.mjs');
  for (const file of files) {
    const child = spawn(process.execPath, ['--experimental-strip-types', file], { stdio: 'inherit', env: { ...process.env, GUCANG_TEST_URL: url } });
    const timer = setTimeout(() => child.kill(), 120_000);
    try {
      const [code] = await once(child, 'exit');
      if (code !== 0) throw new Error(`${file} failed or timed out.`);
    } finally { clearTimeout(timer); }
  }
} finally {
  if (server.exitCode === null) server.kill();
  await closed;
}
