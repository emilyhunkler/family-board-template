// dark.css is made from style.css. If this fails, run: node scripts/make-dark.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from '../scripts/make-dark.mjs';

test('dark.css is up to date with style.css', async () => {
  assert.equal(await readFile(new URL('../public/dark.css', import.meta.url), 'utf8'), await build());
});
