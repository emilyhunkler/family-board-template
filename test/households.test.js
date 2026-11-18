// Each family only ever sees its own data. Two checks:
// 1. Every SQL statement in the code that touches a family's table names household_id, or is marked
//    /* all-families */ on purpose (sign-in by email, secret tokens, rate limits).
// 2. The real worker runs against a throwaway SQLite copy of the schema with two families, and
//    nothing one family adds shows up for the other.
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import * as A from '../src/lib/auth.js';

const FAMILY_TABLES = ['settings', 'checks', 'quest_claims', 'todos', 'ledger', 'groceries', 'meals', 'notes', 'cache', 'events_log', 'feedback', 'reward_requests', 'photos', 'push_subs', 'users', 'sessions', 'invites', 'quiz_runs', 'ratelimit'];

test('every query is limited to one family, or marked on purpose', () => {
  const files = ['src/worker.js', ...readdirSync(new URL('../src/lib/', import.meta.url)).map((f) => 'src/lib/' + f)];
  const bad = [];
  for (const f of files) {
    const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    for (const m of src.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)) {
      const sql = m[0]; if (!/^.(\s*)(SELECT|INSERT|UPDATE|DELETE)\b/i.test(sql)) continue;
      const tables = [...sql.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+(\w+)/gi)].map((x) => x[1].toLowerCase());
      if (!tables.some((t) => FAMILY_TABLES.includes(t))) continue;
      if (!/household_id/.test(sql) && !/all-families/.test(sql)) bad.push(`${f}: ${sql.slice(0, 120)}`);
    }
  }
  assert.deepEqual(bad, [], 'These queries could read or change another family\'s data');
});

// A tiny stand-in for Cloudflare D1 on top of Node's built-in SQLite.
function fakeD1(db) {
  return { prepare(sql) { const st = db.prepare(sql); let args = []; const o = {
    bind(...a) { args = a; return o; },
    async first(col) { const r = st.get(...args); return r ? (col ? r[col] : { ...r }) : null; },
    async all() { return { results: st.all(...args).map((r) => ({ ...r })) }; },
    async run() { const r = st.run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; } }; return o; } };
}

test('two families on one site never see each other', async (t) => {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const ics = readFileSync(new URL('../public/sample.ics', import.meta.url), 'utf8');
  const env = { DB: fakeD1(db), ASSETS: { fetch: async () => new Response(ics) } };
  const realFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error('no network in tests'); }; t.after(() => { globalThis.fetch = realFetch; });
  const { default: worker } = await import('../src/worker.js');

  const now = new Date().toISOString();
  db.prepare("INSERT OR IGNORE INTO households(id,name,created_at) VALUES(2,'Second',?)").run(now);
  db.prepare("INSERT INTO users(email,name,household_id,pw_hash,created_at) VALUES('one@example.com','One',1,'google',?)").run(now);
  db.prepare("INSERT INTO users(email,name,household_id,pw_hash,created_at) VALUES('two@example.com','Two',2,'google',?)").run(now);
  const tok1 = await A.createSession(env, { userId: 1, householdId: 1, kind: 'parent', label: 'test' });
  const tok2 = await A.createSession(env, { userId: 2, householdId: 2, kind: 'parent', label: 'test' });
  const call = async (tok, path, method = 'GET', body) => {
    const r = await worker.fetch(new Request('https://board.test' + path, { method, headers: { cookie: 'fbs=' + tok, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} });
    const text = await r.text(); try { return { status: r.status, data: JSON.parse(text) }; } catch { return { status: r.status, data: text }; }
  };

  assert.equal((await call(tok1, '/api/grocery', 'POST', { text: 'milk' })).status, 200);
  assert.equal((await call(tok2, '/api/grocery', 'POST', { text: 'eggs' })).status, 200);
  await call(tok1, '/api/meal', 'PUT', { date: '2026-12-01', text: 'Tacos' });
  await call(tok2, '/api/meal', 'PUT', { date: '2026-12-01', text: 'Soup' });
  await call(tok1, '/api/note', 'POST', { text: 'Note for one' });
  await call(tok2, '/api/admin/config', 'PUT', { config: { family: { ...(await call(tok2, '/api/admin/config')).data.family, name: 'The Seconds' } } });

  const b1 = (await call(tok1, '/api/board?date=2026-12-01')).data, b2 = (await call(tok2, '/api/board?date=2026-12-01')).data;
  assert.deepEqual(b1.groceries.map((g) => g.text), ['milk']);
  assert.deepEqual(b2.groceries.map((g) => g.text), ['eggs']);
  assert.deepEqual(b1.meals.map((m) => m.text), ['Tacos']);
  assert.deepEqual(b2.meals.map((m) => m.text), ['Soup']);
  assert.deepEqual(b1.notes.map((n) => n.text), ['Note for one']);
  assert.deepEqual(b2.notes, []);
  assert.notEqual(b1.config.family.name, 'The Seconds');
  assert.equal(b2.config.family.name, 'The Seconds');

  // Family 2 can't change or delete family 1's things by guessing ids.
  const milk = b1.groceries[0].id;
  await call(tok2, `/api/grocery/${milk}`, 'DELETE');
  await call(tok2, `/api/grocery/${milk}/toggle`, 'POST', {});
  assert.deepEqual((await call(tok1, '/api/board')).data.groceries.map((g) => [g.text, g.done]), [['milk', 0]]);

  const ph = await call(tok1, '/api/photo', 'POST', { data: 'aGVsbG8=', mime: 'image/jpeg' });
  assert.equal((await call(tok2, `/api/photo/${ph.data.id}`)).status, 404);
  assert.equal((await call(tok1, `/api/photo/${ph.data.id}`)).status, 200);

  const acct2 = (await call(tok2, '/api/admin/account')).data;
  assert.deepEqual(acct2.users.map((u) => u.email), ['two@example.com']);
  assert.equal(acct2.sessions.length, 1);
  await call(tok2, '/api/admin/revoke-others', 'POST', {});
  assert.equal((await call(tok1, '/api/board')).status, 200, "Signing out family 2's other devices must not sign out family 1");

  // The 15-minute job visits both families without mixing them up.
  await new Promise((resolve, reject) => { worker.scheduled({}, env, { waitUntil: (p) => p.then(resolve, reject) }); });
  assert.equal(db.prepare("SELECT COUNT(DISTINCT household_id) AS n FROM settings WHERE key='config'").get().n, 2);
});
