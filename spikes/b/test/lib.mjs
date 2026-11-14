// Shared helpers for the automated runs (plain Playwright library, no test runner).
import { chromium, webkit } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const here = path.dirname(fileURLToPath(import.meta.url));
export const PORT = Number(process.env.SPIKE_PORT || 41731);
export const BASE = `http://127.0.0.1:${PORT}`;
export const outDir = path.join(here, 'out');
fs.mkdirSync(outDir, { recursive: true });

export async function startServer() {
  const child = spawn(process.execPath, [path.join(here, '..', 'serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    child.stdout.once('data', resolve);
    child.once('exit', (c) => reject(new Error('server exited ' + c)));
  });
  return child;
}

export function browserType(name) {
  return name === 'webkit' ? webkit : chromium;
}

// Profiles live on the SSD, not in /tmp (tmpfs on this host), so file I/O is real.
export const profileRoot = process.env.SPIKE_PROFILES || path.join(os.homedir(), '.cache', 'spikeb-profiles');
export function newProfile(tag) {
  fs.mkdirSync(profileRoot, { recursive: true });
  return fs.mkdtempSync(path.join(profileRoot, `${tag}-`));
}
export function dropProfile(dir) {
  if (dir.startsWith(profileRoot)) fs.rmSync(dir, { recursive: true, force: true });
}

export async function launch(name, profileDir, opts = {}) {
  const ctx = await browserType(name).launchPersistentContext(profileDir, { headless: true, ...opts });
  return ctx;
}

export async function openPage(ctx, urlPath, { log = false } = {}) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  if (log) page.on('console', (m) => console.log('[console]', m.type(), m.text().slice(0, 300)));
  await page.goto(BASE + urlPath);
  await page.waitForFunction(() => window.spike && window.spike.bootDone, null, { timeout: 120000 });
  return page;
}

export function save(name, data) {
  const file = path.join(outDir, name);
  fs.writeFileSync(file, JSON.stringify(data, null, 1));
  return file;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Bytes the browser actually holds on disk for OPFS in this profile (ground truth for storage.estimate()). */
export function opfsDiskBytes(profile) {
  const files = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && /File System|FileSystem/i.test(p)) { try { files.push([p.slice(profile.length), fs.statSync(p).size]); } catch { /* raced */ } }
    }
  };
  walk(profile);
  files.sort((a, b) => b[1] - a[1]);
  return { bytes: files.reduce((a, f) => a + f[1], 0), files: files.length, largest: files.slice(0, 4).map(([p, s]) => `${(s / 1e6).toFixed(2)} MB ${p.split('/').slice(-2).join('/')}`) };
}
