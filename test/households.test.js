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

const FAMILY_TABLES = ['settings', 'checks', 'quest_claims', 'todos', 'ledger', 'groceries', 'meals', 'notes', 'cache', 'events_log', 'feedback', 'reward_requests', 'photos', 'push_subs', 'users', 'sessions', 'invites', 'quiz_runs', 'day_plans', 'ratelimit', 'signups', 'pairings', 'app_handoffs'];

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

test('a new family signs up, runs setup, and pairs a kitchen screen', async (t) => {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const env = { DB: fakeD1(db), ASSETS: { fetch: async () => new Response('') }, SITE_NAME: 'Shared Site', SIGNUP_CODES: 'BETA1, BETA2' };
  const realFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error('no network in tests'); }; t.after(() => { globalThis.fetch = realFetch; });
  const { default: worker } = await import('../src/worker.js');
  // The first family already uses the site.
  const now = new Date().toISOString();
  db.prepare("INSERT INTO users(email,name,household_id,pw_hash,created_at) VALUES('first@example.com','First',1,'google',?)").run(now);
  await worker.fetch(new Request('https://site.test/api/health'), env, { waitUntil() {} });
  db.prepare("INSERT OR REPLACE INTO settings(household_id,key,value) VALUES(1,'config',?)").run(JSON.stringify({ family: { name: 'The Firsts', parents: [] }, setup: { done: true } }));

  const jar = {}; const cookieHeader = (who) => Object.entries(jar[who] || {}).map(([k, v]) => `${k}=${v}`).join('; ');
  const go = async (who, path, { method = 'GET', form, ua = 'test' } = {}) => {
    const headers = { cookie: cookieHeader(who), 'user-agent': ua }; let body;
    if (form) { body = new URLSearchParams(form).toString(); headers['content-type'] = 'application/x-www-form-urlencoded'; }
    const r = await worker.fetch(new Request('https://site.test' + path, { method, headers, body, redirect: 'manual' }), env, { waitUntil() {} });
    for (const c of r.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const [k, v] = kv.split('='); jar[who] = jar[who] || {}; if (/Max-Age=0/.test(c)) delete jar[who][k]; else jar[who][k] = v; }
    return { status: r.status, text: await r.text(), location: r.headers.get('location') };
  };

  // Signed out: the site's name and a sign-up link, never the first family's name.
  const home = await go('new', '/');
  assert.match(home.text, /Shared Site/); assert.doesNotMatch(home.text, /The Firsts/); assert.match(home.text, /\/auth\/signup/); assert.match(home.text, /\/auth\/pair/);
  assert.match(home.text, /class="btn2" href="\/auth\/signup">Create your family's board/, 'sign-up is a full button, easy to find');
  // A link with the code in it fills the code in.
  assert.match((await go('new', '/auth/signup?code=BETA2')).text, /name="code"[^>]*value="BETA2"/);
  assert.match((await go('new', '/auth/signup')).text, /Sign up[\s\S]*Add your crew[\s\S]*Put it in the kitchen[\s\S]*No tablet needed yet/, 'sign-up sets expectations with three short steps');

  // Wrong invite code, then a good one.
  const base = { family: 'The Newbies', person: 'Papa', email: 'new@example.com', password: 'pancakes on sunday', zone: 'America/Chicago', method: 'password' };
  assert.match((await go('new', '/auth/signup', { method: 'POST', form: { ...base, code: 'nope' } })).text, /invite code is not right/);
  const made = await go('new', '/auth/signup', { method: 'POST', form: { ...base, code: 'beta2' } });
  assert.equal(made.status, 200); assert.match(made.text, /[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/);
  assert.match((await go('again', '/auth/signup', { method: 'POST', form: { ...base, code: 'BETA1' } })).text, /already has a board/);

  // The new family's board: its own name and time zone, the setup wizard waiting, nothing from family 1.
  const b = JSON.parse((await go('new', '/api/board')).text);
  assert.equal(b.config.family.name, 'The Newbies'); assert.equal(b.zone, 'America/Chicago');
  assert.deepEqual(b.config.setup, { done: false, fresh: true }); assert.equal(b.config.family.parents[0].name, 'Papa'); assert.equal(b.auth.enabled, true);
  const hid = db.prepare("SELECT household_id FROM users WHERE email='new@example.com'").get().household_id; assert.notEqual(hid, 1);

  // A kitchen screen asks for a code; the same code comes back if the page reloads.
  const p1 = await go('kitchen', '/auth/pair', { ua: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Safari' }); const code = /class="code">([A-Z0-9 ]+)</.exec(p1.text)[1];
  assert.equal((await go('kitchen', '/auth/pair')).text.includes(code), true);
  assert.deepEqual(JSON.parse((await go('kitchen', '/auth/pair/status')).text), { waiting: true });

  // A wrong code doesn't pair; the right one (typed loosely) does, into the new family only.
  assert.match((await go('new', '/link', { method: 'POST', form: { code: 'ZZZ ZZZ' } })).text, /didn&#39;t match/);
  assert.match((await go('new', '/link', { method: 'POST', form: { code: code.toLowerCase().replace(' ', '-') } })).text, /will open the board/);
  assert.deepEqual(JSON.parse((await go('kitchen', '/auth/pair/status')).text), { ok: true });
  const kb = JSON.parse((await go('kitchen', '/api/board')).text);
  assert.equal(kb.config.family.name, 'The Newbies'); assert.equal(kb.me.kind, 'display');
  assert.equal(db.prepare("SELECT household_id FROM sessions WHERE kind='display'").get().household_id, hid);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pairings').get().n, 0, 'a used code is gone');

  // The kitchen screen can't pair other screens, and a signed-out phone is sent to sign in.
  assert.match((await go('kitchen', '/link')).text, /grown-up/);
  assert.equal((await go('stranger', '/link')).status, 303);
});

test('a new family can sign up with Google', async (t) => {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const env = { DB: fakeD1(db), ASSETS: { fetch: async () => new Response('') }, SITE_NAME: 'Shared Site', SIGNUP_CODES: 'BETA1', GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'sec', GOOGLE_TOKEN_URL: 'https://token.test/' };
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const realFetch = globalThis.fetch; t.after(() => { globalThis.fetch = realFetch; });
  globalThis.fetch = async (u) => { if (String(u) === 'https://token.test/') return new Response(JSON.stringify({ id_token: `${b64u({})}.${b64u({ iss: 'https://accounts.google.com', aud: 'cid', exp: Date.now() / 1000 + 600, email: 'G@Example.com', email_verified: true })}.sig` })); throw new Error('no network'); };
  const { default: worker } = await import('../src/worker.js');
  const jar = {}; const go = async (path, { method = 'GET', form } = {}) => {
    const headers = { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') }; let body;
    if (form) { body = new URLSearchParams(form).toString(); headers['content-type'] = 'application/x-www-form-urlencoded'; }
    const r = await worker.fetch(new Request('https://site.test' + path, { method, headers, body, redirect: 'manual' }), env, { waitUntil() {} });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); if (/Max-Age=0/.test(c)) delete jar[kv.slice(0, i)]; else jar[kv.slice(0, i)] = kv.slice(i + 1); }
    return { status: r.status, location: r.headers.get('location'), text: await r.text() };
  };
  const s1 = await go('/auth/signup', { method: 'POST', form: { code: 'beta1', family: 'The Googlers', person: 'Mama', zone: 'Europe/Dublin', method: 'google' } });
  assert.match(s1.location, /^\/auth\/google\?signup=[0-9a-f]{64}$/);
  const s2 = await go(s1.location); const state = new URL(s2.location).searchParams.get('state'); assert.ok(state);
  const s3 = await go(`/auth/google/callback?state=${state}&code=abc`); assert.equal(s3.status, 303, s3.text);
  const b = JSON.parse((await go('/api/board')).text);
  assert.equal(b.config.family.name, 'The Googlers'); assert.equal(b.zone, 'Europe/Dublin'); assert.equal(b.me.kind, 'parent');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM signups').get().n, 0);
  assert.equal(db.prepare("SELECT pw_hash FROM users WHERE email='g@example.com'").get().pw_hash, 'google');
});
