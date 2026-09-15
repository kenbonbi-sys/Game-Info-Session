// Rebuild the checked-in film: node scripts/render-victory.mjs
// Needs ffmpeg on PATH and Playwright (or PLAYWRIGHT_MODULE pointing to its index.mjs).
// Set CHROMIUM_EXECUTABLE if using a browser outside Playwright's default installation.
// Each frame is rendered at an exact timestamp; FFmpeg provides a seekable 10.000s file.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let playwright;
try { playwright = await import('playwright'); }
catch {
  const bundled = resolve(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const module = process.env.PLAYWRIGHT_MODULE || bundled;
  if (!existsSync(module)) throw new Error('Install Playwright, or set PLAYWRIGHT_MODULE to its index.mjs.');
  playwright = await import(pathToFileURL(module).href);
}

const types = { '.html': 'text/html', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.otf': 'font/otf', '.webm': 'video/webm' };
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!path.startsWith(root + '/') && !path.startsWith(root + '\\')) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
    res.end(await readFile(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser, encoder;
try {
  browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => { throw error; });
  await page.goto(`http://127.0.0.1:${server.address().port}/tools/victory-render.html`);
  await page.waitForFunction(() => window.victoryReady);
  await mkdir(resolve(root, 'assets/video'), { recursive: true });
  const duration = await page.evaluate(() => window.victoryDuration), fps = 30;
  const output = resolve(root, 'assets/video/fox-team-victory.webm');
  encoder = spawn(process.env.FFMPEG || 'ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', 'pipe:0', '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '26', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-pix_fmt', 'yuv420p', '-t', String(duration), output], { windowsHide: true, stdio: ['pipe', 'inherit', 'inherit'] });
  const encoded = once(encoder, 'close');
  for (let frame = 0; frame < duration * fps; frame++) {
    const png = await page.evaluate(t => window.renderVictoryFrame(t), frame / fps);
    if (!encoder.stdin.write(Buffer.from(png.split(',')[1], 'base64'))) await once(encoder.stdin, 'drain');
    if (frame % 60 === 0) process.stdout.write(`Rendered ${frame}/${duration * fps} frames\n`);
  }
  encoder.stdin.end();
  const [code] = await encoded;
  if (code) throw new Error(`FFmpeg exited ${code}`);
  const metadata = await page.evaluate(async () => {
    const video = document.createElement('video');
    video.muted = true;
    video.src = '/assets/video/fox-team-victory.webm';
    await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = reject; });
    await new Promise((resolve, reject) => { video.onseeked = resolve; video.onerror = reject; video.currentTime = 8.3; });
    return { duration: video.duration, width: video.videoWidth, height: video.videoHeight, readyState: video.readyState };
  });
  if (Math.abs(metadata.duration - duration) > .05 || metadata.width !== 1280 || metadata.height !== 720 || metadata.readyState < 2) {
    throw new Error(`Invalid browser playback metadata: ${JSON.stringify(metadata)}`);
  }
  process.stdout.write(`Browser decoded and sought to 8.3s: ${JSON.stringify(metadata)}\n`);
  const poster = await page.evaluate(() => { window.renderVictoryFrame(8.3); return document.querySelector('canvas').toDataURL('image/jpeg', .94); });
  await writeFile(resolve(root, 'assets/video/fox-team-victory-poster.jpg'), Buffer.from(poster.split(',')[1], 'base64'));
  if (process.argv.includes('--stills')) {
    for (const seconds of [0, 1.8, 3.3, 4.6, 6.2, 9.5]) {
      const still = await page.evaluate(t => window.renderVictoryFrame(t), seconds);
      await writeFile(resolve(root, `assets/video/qa-${seconds}.png`), Buffer.from(still.split(',')[1], 'base64'));
    }
  }
  process.stdout.write(`Saved ${duration.toFixed(3)}s, 1280×720, ${fps}fps: ${output}\n`);
} finally {
  if (encoder && !encoder.killed && encoder.exitCode === null) encoder.kill();
  await browser?.close();
  server.close();
}
