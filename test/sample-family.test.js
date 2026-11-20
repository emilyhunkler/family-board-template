// The pretend family for the test copy loads cleanly and gives the chart something to show.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { parts } from '../src/lib/ical.js';

test('the pretend family loads into a fresh database', () => {
  const db = new DatabaseSync(':memory:'); const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const sql = execFileSync(process.execPath, [new URL('../scripts/sample-family.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  db.exec(sql); db.exec(sql); // running it twice just replaces the family
  const cfg = JSON.parse(db.prepare("SELECT value FROM settings WHERE key='config' AND household_id=1").get().value);
  assert.deepEqual(cfg.kids.map((k) => k.name), ['Ava', 'Lily']);
  assert.ok(cfg.tasks.some((t) => t.title === 'Feed the dog'));
  assert.ok(db.prepare("SELECT value FROM settings WHERE key='weekbar'").get());
  // Pay day is today and already closed, so the pay day screen shows; Lily has savings in her bank.
  assert.equal(cfg.week.payDay, parts(new Date(), cfg.zone).wd); assert.equal(cfg.week.closesAt, '00:00');
  assert.equal(db.prepare("SELECT SUM(amount) AS s FROM ledger WHERE kid='kid2' AND kind='jar'").get().s, 4);
});
