// Every file the browser loads must at least parse. One broken file leaves the board stuck on "Loading the board…".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../public/', import.meta.url));
for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
  test(`public/${f} parses`, () => {
    try { execFileSync(process.execPath, ['--input-type=module', '--check'], { input: readFileSync(dir + f), stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (e) { assert.fail(`public/${f} has a syntax error:\n` + String(e.stderr || e.message).slice(0, 400)); }
  });
}
