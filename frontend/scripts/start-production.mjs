import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const standalone = resolve(root, '.next/standalone');
const server = resolve(standalone, 'server.js');
if (!existsSync(server)) throw new Error('Run npm run build before npm start.');
// Next standalone output intentionally omits static/public assets; prepare them for local startup.
cpSync(resolve(root, '.next/static'), resolve(standalone, '.next/static'), { recursive: true });
cpSync(resolve(root, 'public'), resolve(standalone, 'public'), { recursive: true });
process.env.PORT ??= '3000';
process.env.HOSTNAME ??= '127.0.0.1';
await import(pathToFileURL(server).href);
