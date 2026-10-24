import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
const target = resolve('public/docs');
mkdirSync(target, { recursive: true });
for (const [source, name] of [['../README.md', 'README.md'], ['../docs/BRAND.md', 'BRAND.md'], ['../docs/API_CONTRACT.md', 'API_CONTRACT.md']]) {
  if (existsSync(source)) copyFileSync(source, resolve(target, name));
}
