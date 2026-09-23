import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { FINALE } from '../src/finale-config.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixtureQuestion = { id: 'test', text: 'Test', options: ['A', 'B'], answer: 0 };

// Each test runs a real HTTP/SSE server against a temporary one-question quiz. The
// live workspace questions, event server, connected phones and their scores are untouched.
async function gameFor(t, { chargeSeconds = 60, finale = fixtureQuestion } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'fox-finale-test-'));
  const portProbe = createServer();
  portProbe.listen(0, '127.0.0.1');
  await once(portProbe, 'listening');
  const port = portProbe.address().port;
  await new Promise(resolveClose => portProbe.close(resolveClose));
  await mkdir(join(dir, 'src'));
  await mkdir(join(dir, 'data'));
  await mkdir(join(dir, 'assets', 'video'), { recursive: true });
  await Promise.all(['server.js', 'package.json', 'src/config.js', 'src/finale-config.js', 'src/identity.js'].map(file => copyFile(join(root, file), join(dir, file))));
  await writeFile(join(dir, 'data', 'questions.json'), JSON.stringify({
    readSeconds: 0.08, timePerQuestion: 0.08, revealSeconds: 0.08, fireSeconds: 0.08,
    chargeSeconds, shuffleOptions: false, questions: [fixtureQuestion], finale,
  }));
  await writeFile(join(dir, 'assets', 'video', 'seek.webm'), Buffer.from('0123456789abcdef'));
  await writeFile(join(dir, 'assets', 'video', 'seek.mp4'), Buffer.from('mp4-test'));
  const child = spawn(process.execPath, ['server.js', `--port=${port}`], {
    cwd: dir, env: { ...process.env, HOST_KEY: 'finale-test-key', PUBLIC_URL: '', RENDER_EXTERNAL_URL: '' },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', b => { output += b; });
  child.stderr.on('data', b => { output += b; });
  const streams = [];
  t.after(async () => {
    for (const stream of streams) stream.close();
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    // This directory is created by mkdtemp for this test, never a source/workspace path.
    assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + '\\') || resolve(dir).startsWith(resolve(tmpdir()) + '/'));
    assert.ok(dir.includes('fox-finale-test-'));
    await rm(dir, { recursive: true, force: true });
  });
  for (let n = 0; !output.includes('Fox Quiz đang chạy'); n++) {
    assert.ok(n < 100 && child.exitCode === null, `Test server failed: ${output}`);
    await delay(30);
  }
  const base = `http://127.0.0.1:${port}`;
  async function events(path = '/api/host/events?key=finale-test-key&view=screen') {
    const abort = new AbortController();
    const response = await fetch(base + path, { signal: abort.signal });
    assert.equal(response.status, 200);
    const messages = [];
    const waiting = new Set();
    const stream = {
      messages,
      close: () => abort.abort(),
      // Long enough to sit out the longest phase there is: the victory clip. Tied to the config
      // so lengthening any part of the finale doesn't start failing the suite.
      waitFor(predicate, timeout = (FINALE.unleashSeconds + FINALE.victorySeconds + 4) * 1000) {
        const found = messages.findLast(predicate);
        if (found) return Promise.resolve(found);
        return new Promise((resolveMessage, reject) => {
          const timer = setTimeout(() => {
            waiting.delete(listener);
            reject(new Error(`SSE timeout. Phases: ${messages.filter(m => m.type === 'state').map(m => m.phase).join(', ')}`));
          }, timeout);
          const listener = msg => {
            if (!predicate(msg)) return;
            clearTimeout(timer);
            waiting.delete(listener);
            resolveMessage(msg);
          };
          waiting.add(listener);
        });
      },
    };
    streams.push(stream);
    (async () => {
      let buffer = '';
      const decoder = new TextDecoder();
      for await (const part of response.body) {
        buffer += decoder.decode(part, { stream: true });
        let split;
        while ((split = buffer.indexOf('\n\n')) !== -1) {
          const event = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          if (!event.startsWith('data: ')) continue;
          const msg = JSON.parse(event.slice(6));
          messages.push(msg);
          for (const listener of waiting) listener(msg);
        }
      }
    })().catch(err => { if (err.name !== 'AbortError') throw err; });
    return stream;
  }
  const host = async action => fetch(`${base}/api/host/${action}?key=finale-test-key`, { method: 'POST' });
  const screen = await events();
  const state = phase => screen.waitFor(m => m.type === 'state' && m.phase === phase);
  async function start() {
    assert.equal((await host('start')).status, 200);
    return state('charge');
  }
  return { base, host, screen, state, events, start };
}

test('server finale sequencing and reconnects', { concurrency: 4, timeout: 45000 }, async t => {
  await Promise.all([
    t.test('full bottle throws, boss survives until defeat, clip finishes before Top 5', async t => {
      const app = await gameFor(t);
      const joined = await fetch(`${app.base}/api/join`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'test.fox' }),
      }).then(r => r.json());
      const phone = await app.events(`/api/events?pid=${joined.pid}`);
      await app.start();
      await app.host('fill');
      const unleash = await app.state('unleash');
      assert.equal(unleash.charge.full, true);
      assert.ok(unleash.bossDmg < unleash.bossMax, 'Filling the bottle must not kill the boss');
      assert.equal(unleash.endsAt - unleash.phaseAt, FINALE.unleashSeconds * 1000);
      for (const action of ['next', 'fill', 'start']) assert.equal((await app.host(action)).status, 200);
      assert.equal((await app.host('end')).status, 404, 'No end shortcut may bypass the clip');
      await delay(FINALE.defeatAt * 1000 - 500);
      const reconnected = await app.events();
      const resumed = await reconnected.waitFor(m => m.type === 'state');
      assert.equal(resumed.phase, 'unleash');
      assert.equal(resumed.phaseAt, unleash.phaseAt);
      assert.equal(resumed.endsAt, unleash.endsAt);
      assert.ok(resumed.bossDmg < resumed.bossMax, 'The boss must still survive while the film is playing');
      const defeated = await app.screen.waitFor(m => m.type === 'state' && m.phase === 'unleash' && m.boss === 0);
      assert.ok(defeated.now - unleash.phaseAt >= FINALE.defeatAt * 1000 - 20);
      const victory = await app.state('victory');
      assert.equal(victory.bossDmg, victory.bossMax);
      assert.ok(victory.phaseAt - unleash.phaseAt >= FINALE.unleashSeconds * 1000 - 20);
      assert.equal(victory.endsAt - victory.phaseAt, FINALE.victorySeconds * 1000);
      assert.equal((await phone.waitFor(m => m.type === 'state' && m.phase === 'victory')).phaseAt, victory.phaseAt);
      for (const action of ['next', 'fill', 'start']) await app.host(action);
      assert.equal((await app.host('end')).status, 404);
      const duringClip = await app.events();
      const resumedClip = await duringClip.waitFor(m => m.type === 'state');
      assert.equal(resumedClip.phase, 'victory');
      assert.equal(resumedClip.phaseAt, victory.phaseAt);
      const end = await app.state('end');
      assert.ok(end.phaseAt - victory.phaseAt >= FINALE.victorySeconds * 1000 - 20, 'Top 5 must wait for the full clip');
      // Bảng vinh danh hiện đúng domain người chơi đã gõ.
      assert.equal(end.top[0].name, 'test.fox');
      assert.equal((await phone.waitFor(m => m.type === 'state' && m.phase === 'end')).phaseAt, end.phaseAt);
      const phases = app.screen.messages.filter(m => m.type === 'state').map(m => m.phase);
      assert.deepEqual(phases.filter((phase, i) => phase !== phases[i - 1]).slice(-4), ['charge', 'unleash', 'victory', 'end']);
    }),
    t.test('reset during throw cancels defeat and all later finale phases', async t => {
      const app = await gameFor(t);
      await app.start();
      await app.host('fill');
      await app.state('unleash');
      await app.host('reset');
      const resetAt = app.screen.messages.length;
      await delay((FINALE.unleashSeconds + 0.4) * 1000);
      const final = app.screen.messages.filter(m => m.type === 'state').at(-1);
      assert.equal(final.phase, 'lobby');
      assert.equal(final.boss, 100);
      assert.equal(final.finisher, false);
      assert.equal(app.screen.messages.slice(resetAt).some(m => m.type === 'state' && ['unleash', 'victory', 'end'].includes(m.phase)), false);
    }),
    t.test('quiet room without a fun question still gets the finale; reset cancels clip completion', async t => {
      const app = await gameFor(t, { finale: null, chargeSeconds: 0.08 });
      await app.start();
      const unleash = await app.state('unleash');
      assert.equal(unleash.charge.full, true);
      assert.ok(unleash.boss > 0);
      await app.state('victory');
      await app.host('reset');
      const resetAt = app.screen.messages.length;
      await delay((FINALE.victorySeconds + 0.4) * 1000);
      assert.equal(app.screen.messages.filter(m => m.type === 'state').at(-1).phase, 'lobby');
      assert.equal(app.screen.messages.slice(resetAt).some(m => m.type === 'state' && m.phase === 'end'), false);
    }),
    t.test('video MIME, HEAD and byte ranges support replay and reconnect seeks', async t => {
      const app = await gameFor(t);
      const url = `${app.base}/assets/video/seek.webm`;
      const full = await fetch(url);
      assert.equal(full.headers.get('content-type'), 'video/webm');
      assert.equal(full.headers.get('accept-ranges'), 'bytes');
      assert.equal(await full.text(), '0123456789abcdef');
      const range = await fetch(url, { headers: { Range: 'bytes=4-9' } });
      assert.equal(range.status, 206);
      assert.equal(range.headers.get('content-range'), 'bytes 4-9/16');
      assert.equal(range.headers.get('content-length'), '6');
      assert.equal(await range.text(), '456789');
      assert.equal(await fetch(url, { headers: { Range: 'bytes=-4' } }).then(r => r.text()), 'cdef');
      assert.equal(await fetch(url, { headers: { Range: 'bytes=12-' } }).then(r => r.text()), 'cdef');
      const invalid = await fetch(url, { headers: { Range: 'bytes=16-' } });
      assert.equal(invalid.status, 416);
      assert.equal(invalid.headers.get('content-range'), 'bytes */16');
      const head = await fetch(url, { method: 'HEAD' });
      assert.equal(head.headers.get('content-length'), '16');
      assert.equal(await head.text(), '');
      const mp4 = await fetch(`${app.base}/assets/video/seek.mp4`);
      assert.equal(mp4.headers.get('content-type'), 'video/mp4');
      await mp4.arrayBuffer();
    }),
  ]);
});
