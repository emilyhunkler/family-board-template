// Privacy page, a family's download and delete, the owner's overview, and public feedback with names removed.
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import * as A from '../src/lib/auth.js';
import { redact, FAMILY_TABLES } from '../src/lib/account.js';

function fakeD1(db) {
  return { prepare(sql) { const st = db.prepare(sql); let args = []; const o = {
    bind(...a) { args = a; return o; },
    async first(col) { const r = st.get(...args); return r ? (col ? r[col] : { ...r }) : null; },
    async all() { return { results: st.all(...args).map((r) => ({ ...r })) }; },
    async run() { const r = st.run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; } }; return o; } };
}

test('public feedback loses the board\'s names, emails and phone numbers', () => {
  const cfg = { kids: [{ name: 'Maya' }, { name: 'Jo' }], family: { name: 'The Rivera Family', dog: 'Biscuit', parents: [{ name: 'Mom', match: ['Mom', 'Ana Rivera'] }, { name: 'Papa', match: [] }] } };
  const out = redact("Maya's chores vanished and Jo cried. MOM wants Biscuit on the board. The Rivera Family loves it. Call Ana Rivera at 740-555-1234 or ana@example.com. Mommy and Joker stay.", cfg);
  assert.equal(out, "[kid]'s chores vanished and [kid] cried. [grown-up] wants [pet] on the board. [family] loves it. Call [grown-up] at [phone] or [email]. Mommy and Joker stay.");
});

test('every family table is covered by download and delete', () => {
  const schema = readdirSync(new URL('../migrations/', import.meta.url)).filter((f) => f.endsWith('.sql')).map((f) => readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8')).join('\n');
  const db = new DatabaseSync(':memory:'); db.exec(schema);
  const withHousehold = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name).filter((t) => db.prepare(`PRAGMA table_info(${t})`).all().some((c) => c.name === 'household_id'));
  assert.deepEqual(withHousehold.filter((t) => !FAMILY_TABLES.includes(t)), [], 'A table has household_id but delete and download skip it');
});

test('privacy page, download, delete and the owner overview', async (t) => {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const env = { DB: fakeD1(db), ASSETS: { fetch: async () => new Response('') }, SITE_NAME: 'Shared Site', OWNER_EMAILS: 'Owner@Example.com', CONTACT_EMAIL: 'hello@site.test' };
  const realFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error('no network'); }; t.after(() => { globalThis.fetch = realFetch; });
  const { default: worker } = await import('../src/worker.js');
  const now = new Date().toISOString();
  db.prepare("INSERT OR IGNORE INTO households(id,name,created_at) VALUES(2,'Two',?)").run(now);
  db.prepare("INSERT INTO users(email,name,household_id,pw_hash,pw_salt,created_at) VALUES('owner@example.com','Owner',1,'secret-hash','salt',?)").run(now);
  db.prepare("INSERT INTO users(email,name,household_id,pw_hash,created_at) VALUES('two@example.com','Two',2,'google',?)").run(now);
  const tok1 = await A.createSession(env, { userId: 1, householdId: 1, kind: 'parent', label: 'test' });
  const tok2 = await A.createSession(env, { userId: 2, householdId: 2, kind: 'parent', label: 'test' });
  const kitchen2 = await A.createSession(env, { userId: 2, householdId: 2, kind: 'display', label: 'test' });
  const go = async (tok, path, { method = 'GET', form, json } = {}) => {
    const headers = { cookie: tok ? 'fbs=' + tok : '' }; let body;
    if (form) { body = new URLSearchParams(form).toString(); headers['content-type'] = 'application/x-www-form-urlencoded'; }
    if (json) { body = JSON.stringify(json); headers['content-type'] = 'application/json'; }
    const r = await worker.fetch(new Request('https://site.test' + path, { method, headers, body, redirect: 'manual' }), env, { waitUntil() {} });
    return { status: r.status, text: await r.text(), headers: r.headers };
  };
  // Some data for both families.
  await go(tok1, '/api/grocery', { method: 'POST', json: { text: 'milk' } });
  await go(tok2, '/api/grocery', { method: 'POST', json: { text: 'eggs' } });
  await go(tok2, '/api/photo', { method: 'POST', json: { data: 'aGVsbG8=', mime: 'image/jpeg' } });
  await go(tok2, '/api/feedback', { method: 'POST', json: { text: 'Love it', from: 'Two' } });

  // Anyone can read the privacy page, and it names the contact.
  const priv = await go(null, '/privacy'); assert.equal(priv.status, 200); assert.match(priv.text, /hello@site\.test/); assert.match(priv.text, /Nothing is used to train AI/);
  assert.match((await go(null, '/')).text, /href="\/privacy"/);

  // The account page is for a grown-up of that family only.
  assert.equal((await go(null, '/account')).status, 303);
  assert.match((await go(kitchen2, '/account')).text, /grown-up/);
  assert.match((await go(tok2, '/account')).text, /Delete our board/);

  // The download has this family's things and none of its secrets, and nothing from family 1.
  const ex = await go(tok2, '/account/export'); assert.match(ex.headers.get('content-disposition'), /attachment/);
  const data = JSON.parse(ex.text);
  assert.deepEqual(data.groceries.map((g) => g.text), ['eggs']); assert.equal(data.photos.length, 1);
  assert.deepEqual(data.users.map((u) => u.email), ['two@example.com']);
  assert.ok(!ex.text.includes('secret-hash') && !ex.text.includes('pw_hash') && !ex.text.includes('"pin"') && !ex.text.includes('milk'));
  assert.ok(!data.settings.some((s) => ['vapid', 'recovery', 'gate'].includes(s.key)));

  // Only the owner sees the overview, and it shows counts, not contents.
  assert.match((await go(tok2, '/owner')).text, /only for the person who runs the site/);
  const ov = await go(tok1, '/owner'); assert.match(ov.text, /2 families/); assert.match(ov.text, /Love it/); assert.ok(!ov.text.includes('eggs'));

  // A wrong name deletes nothing; the right one removes every row of family 2 and nothing of family 1.
  const name2 = JSON.parse((await go(tok2, '/api/board')).text).config.family.name;
  assert.match((await go(tok2, '/account/delete', { method: 'POST', form: { name: 'nope' } })).text, /nothing was deleted/);
  const del = await go(tok2, '/account/delete', { method: 'POST', form: { name: name2 } });
  assert.match(del.text, /Your board is deleted/); assert.match(del.headers.get('set-cookie'), /fbs=;/);
  for (const t2 of FAMILY_TABLES) assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${t2} WHERE household_id=2`).get().n, 0, t2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM households WHERE id=2').get().n, 0);
  assert.equal((await go(kitchen2, '/api/board')).status, 401, "family 2's kitchen screen is signed out");
  assert.deepEqual(JSON.parse((await go(tok1, '/api/board')).text).groceries.map((g) => g.text), ['milk']);
});
