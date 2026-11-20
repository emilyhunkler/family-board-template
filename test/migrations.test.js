// Families use the board every day, so a database change must never rewrite or remove what they have.
// New migrations may only add (new tables, indexes or columns). A migration that has to change existing
// rows needs its own plan in RELEASING.md and the line "-- reviewed: changes existing data" at the top.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const FROZEN_BEFORE = 9; // 0001 to 0008 were written before this rule and have already run everywhere
test('new migrations only add, never rewrite or remove', () => {
  const dir = new URL('../migrations/', import.meta.url); const bad = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    if (parseInt(f, 10) < FROZEN_BEFORE) continue;
    const sql = readFileSync(new URL(f, dir), 'utf8'); if (/^-- reviewed: changes existing data/m.test(sql)) continue;
    const code = sql.replace(/--.*$/gm, '');
    for (const m of code.matchAll(/\b(DROP|DELETE|UPDATE|REPLACE|RENAME|INSERT)\b/gi)) bad.push(`${f}: ${m[1]}`);
    for (const st of code.split(';').map((x) => x.trim()).filter(Boolean)) if (!/^(CREATE (UNIQUE )?(TABLE|INDEX) IF NOT EXISTS|ALTER TABLE \w+ ADD COLUMN)\b/i.test(st)) bad.push(`${f}: ${st.slice(0, 60)}`);
  }
  assert.deepEqual(bad, []);
});

test('the live and test copies use different databases', () => {
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  const names = [...toml.matchAll(/database_name\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(names, ['family_board', 'family_board_staging']);
  assert.match(toml, /\[env\.staging\][\s\S]*name = "family-board-staging"/);
});
