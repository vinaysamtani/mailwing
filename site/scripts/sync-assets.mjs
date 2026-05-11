#!/usr/bin/env node
// Copies brand assets from the Mailwing repo root into site/public/img/ at build time.
// Source of truth lives in /build/ and /docs/; this script keeps the static site copies in sync.

import { mkdir, copyFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(__dirname, '..');
const repoRoot = resolve(siteRoot, '..');

const sources = [
  { from: `${repoRoot}/build/icon.png`,           to: `${siteRoot}/public/img/icon.png` },
  { from: `${repoRoot}/build/social-preview.png`, to: `${siteRoot}/public/img/social-preview.png` },
];

await mkdir(`${siteRoot}/public/img`, { recursive: true });

let copied = 0;
let missing = 0;
for (const { from, to } of sources) {
  try {
    await access(from);
    await copyFile(from, to);
    copied++;
  } catch {
    missing++;
    console.warn(`[sync-assets] missing source: ${from}`);
  }
}
console.log(`[sync-assets] copied ${copied}, missing ${missing}`);
