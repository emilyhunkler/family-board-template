// Photos live in R2 file storage, one folder per family, so the shared database stays small. Older photos are
// copied over a few at a time and keep their original in the database until a person clears it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import * as A from '../src/lib/auth.js';
import * as PH from '../src/lib/photos.js';

function fakeD1(db) {
  return { prepare(sql) { const st = db.prepare(sql); let args = []; const o = {
    bind(...a) { args = a; return o; },
    async first(col) { const r = st.get(...args); return r ? (col ? r[col] : { ...r }) : null; },
    async all() { return { results: st.all(...args).map((r) => ({ ...r })) }; },
    async run() { const r = st.run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; } }; return o; } };
}

// A stand-in for an R2 bucket. Like R2, it refuses an upload whose sha256 doesn't match the bytes.
function fakeR2({ failPuts = false } = {}) {
  const files = new Map();
  return { files,
    async put(key, value, opts = {}) {
      if (failPuts) throw new Error('R2 is down');
      const bytes = new Uint8Array(value);
      if (opts.sha256 && createHash('sha256').update(bytes).digest('hex') !== opts.sha256) throw new Error('sha256 mismatch');
      files.set(key, { bytes, type: opts.httpMetadata?.contentType });
    },
    async head(key) { const f = files.get(key); return f ? { size: f.bytes.length } : null; },
    async get(key) { const f = files.get(key); if (!f) return null; return { body: new Response(f.bytes).body, httpMetadata: { contentType: f.type }, size: f.bytes.length, arrayBuffer: async () => f.bytes.slice().buffer }; },
    async delete(keys) { for (const k of [].concat(keys)) files.delete(k); } };
}

async function setup(t, extra = {}) {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const env = { DB: fakeD1(db), ASSETS: { fetch: async () => new Response('') }, ...extra };
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
    return { status: r.status, type: r.headers.get('content-type'), bytes: new Uint8Array(await r.arrayBuffer()) };
  };
  const json = (r) => JSON.parse(new TextDecoder().decode(r.bytes));
  return { db, env, tok1, tok2, call, json, now };
}

const PIC = Uint8Array.from({ length: 5000 }, (_, i) => (i * 7) % 256); const PIC64 = Buffer.from(PIC).toString('base64');

test('new photos go to file storage, in their own family\'s folder, and only that family sees them', async (t) => {
  const R2 = fakeR2(); const { db, tok1, tok2, call, json } = await setup(t, { PHOTOS: R2 });
  const add = await call(tok1, '/api/photo', 'POST', { data: 'data:image/jpeg;base64,' + PIC64, mime: 'image/jpeg' });
  assert.equal(add.status, 200); const id = json(add).id;
  const row = db.prepare('SELECT * FROM photos WHERE id=?').get(id);
  assert.equal(row.data, '', 'the picture itself is not in the database'); assert.equal(row.size, PIC.length); assert.match(row.r2_key, /^families\/1\/[0-9a-f-]{36}$/);
  assert.deepEqual(R2.files.get(row.r2_key).bytes, PIC);
  const got = await call(tok1, `/api/photo/${id}`); assert.equal(got.status, 200); assert.equal(got.type, 'image/jpeg'); assert.deepEqual(got.bytes, PIC);
  assert.equal((await call(tok2, `/api/photo/${id}`)).status, 404, 'another family cannot open it');
  await call(tok2, `/api/photo/${id}`, 'DELETE'); assert.ok(R2.files.has(row.r2_key), "another family can't delete it");
  await call(tok1, `/api/photo/${id}`, 'DELETE');
  assert.equal(R2.files.size, 0); assert.equal(db.prepare('SELECT COUNT(*) AS n FROM photos').get().n, 0);
});

test('if file storage fails, nothing half-saved is left behind', async (t) => {
  const { db, tok1, call } = await setup(t, { PHOTOS: fakeR2({ failPuts: true }) });
  assert.notEqual((await call(tok1, '/api/photo', 'POST', { data: PIC64, mime: 'image/jpeg' })).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM photos').get().n, 0);
});

test('a site without file storage keeps photos in the database as before', async (t) => {
  const { db, tok1, call, json } = await setup(t);
  const id = json(await call(tok1, '/api/photo', 'POST', { data: PIC64, mime: 'image/jpeg' })).id;
  const row = db.prepare('SELECT * FROM photos WHERE id=?').get(id); assert.equal(row.data, PIC64); assert.equal(row.r2_key, null);
  assert.deepEqual((await call(tok1, `/api/photo/${id}`)).bytes, PIC);
});

test('older photos are copied over a few at a time, checked, and keep their original', async (t) => {
  const R2 = fakeR2(); const { db, env, tok1, tok2, call, now } = await setup(t, { PHOTOS: R2 });
  const ins = db.prepare('INSERT INTO photos(data,mime,created_at,household_id) VALUES(?,?,?,?)');
  const ids = [1, 2, 1, 2, 1].map((hid) => Number(ins.run(PIC64, 'image/jpeg', now, hid).lastInsertRowid));
  assert.equal(await PH.moveSome(env, 3), 3);
  assert.equal(await PH.moveSome(env, 3), 2);
  assert.equal(await PH.moveSome(env, 3), 0, 'nothing left to copy');
  for (const r of db.prepare('SELECT * FROM photos').all()) {
    assert.equal(r.data, PIC64, 'the original stays in the database'); assert.equal(r.size, PIC.length);
    assert.ok(r.r2_key.startsWith(`families/${r.household_id}/`), 'each photo goes into its own family\'s folder');
    assert.deepEqual(R2.files.get(r.r2_key).bytes, PIC);
  }
  // Once the database copy is cleared, the board shows the photo from file storage.
  db.prepare("UPDATE photos SET data='' WHERE id=?").run(ids[0]);
  assert.deepEqual((await call(tok1, `/api/photo/${ids[0]}`)).bytes, PIC);
  assert.equal((await call(tok2, `/api/photo/${ids[0]}`)).status, 404);
  // If the file ever went missing, the board falls back to the database copy while it's still there.
  R2.files.delete(db.prepare('SELECT r2_key FROM photos WHERE id=?').get(ids[1]).r2_key);
  assert.deepEqual((await call(tok2, `/api/photo/${ids[1]}`)).bytes, PIC);
});

test('a failed copy changes nothing and is tried again next time', async (t) => {
  const { db, env, now } = await setup(t, { PHOTOS: fakeR2({ failPuts: true }) });
  db.prepare('INSERT INTO photos(data,mime,created_at,household_id) VALUES(?,?,?,?)').run(PIC64, 'image/jpeg', now, 1);
  assert.equal(await PH.moveSome(env), 0);
  const r = db.prepare('SELECT * FROM photos').get(); assert.equal(r.r2_key, null); assert.equal(r.data, PIC64);
});

test('a family\'s download has its photos, and deleting the board removes its files', async (t) => {
  const R2 = fakeR2(); const { db, env, tok1, tok2, call, json } = await setup(t, { PHOTOS: R2 });
  await call(tok1, '/api/photo', 'POST', { data: PIC64, mime: 'image/jpeg' });
  await call(tok2, '/api/photo', 'POST', { data: PIC64, mime: 'image/jpeg' });
  const ex = json(await call(tok2, '/account/export'));
  assert.equal(ex.photos.length, 1); assert.equal(ex.photos[0].data, PIC64); assert.ok(!('r2_key' in ex.photos[0]));
  const name2 = json(await call(tok2, '/api/board')).config.family.name;
  const r = await (await import('../src/worker.js')).default.fetch(new Request('https://board.test/account/delete', { method: 'POST', headers: { cookie: 'fbs=' + tok2, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ name: name2 }).toString() }), env, { waitUntil() {} });
  assert.match(await r.text(), /Your board is deleted/);
  assert.deepEqual([...R2.files.keys()].map((k) => k.split('/')[1]), ['1'], "only family 1's photo is left");
});

test('the 15-minute job copies older photos', () => {
  const src = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
  const job = src.slice(src.indexOf('async scheduled('), src.indexOf('async fetch('));
  assert.match(job, /PH\.moveSome\(env\)/);
});

test('the live board and the test copy keep photos in different buckets', () => {
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  const bucket = (envName) => (toml.match(new RegExp(`\\[\\[env\\.${envName}\\.r2_buckets\\]\\]\\s*\\nbinding = "PHOTOS"\\s*\\nbucket_name = "([^"]+)"`)) || [])[1];
  assert.equal(bucket('live'), 'family-board-photos');
  assert.equal(bucket('staging'), 'family-board-photos-staging');
});
