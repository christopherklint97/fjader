// Copy the production build to the directory a static demo host serves.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), process.env.SPIKE_DIST || 'dist');
const dst = process.argv[2] || path.join(os.homedir(), 'writing-app-spikes', 'b');
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
fs.cpSync(src, dst, { recursive: true });
console.log(`copied ${src} -> ${dst}`);
