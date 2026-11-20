// Get the app: each device gets its own steps, the manifest makes the board installable, and a new iPhone or
// iPad app signs in to the same family once (iOS gives home-screen apps their own storage, separate from Safari).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import * as A from '../src/lib/auth.js';
import { manifest } from '../src/lib/app.js';
import { deviceKind, deviceWord, iosVersion } from '../public/device.js';

const UA = {
  iphoneSafari26: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  iphoneSafari17: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneApp: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.101 Mobile/15E148 Safari/604.1',
  iphoneFacebook: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]',
  iphoneGmail: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
};

test('each device gets the steps that fit it', () => {
  const k = (ua, extra = {}) => deviceKind({ ua, platform: extra.platform || '', touchPoints: extra.touchPoints || 0 });
  assert.equal(k(UA.iphoneSafari26), 'ios-safari');
  assert.equal(k(UA.iphoneSafari17), 'ios-safari');
  assert.equal(k(UA.iphoneChrome), 'ios-chrome');
  assert.equal(k(UA.iphoneFacebook), 'ios-other', 'an app’s built-in browser says to open Safari first');
  assert.equal(k(UA.iphoneGmail), 'ios-other');
  assert.equal(k(UA.ipadDesktop, { platform: 'MacIntel', touchPoints: 5 }), 'ios-safari', 'an iPad that says it is a Mac');
  assert.equal(k(UA.macSafari, { platform: 'MacIntel', touchPoints: 0 }), 'mac-safari');
  assert.equal(k(UA.android), 'android');
  assert.equal(k(UA.winChrome), 'desktop');
  assert.equal(k(UA.winEdge), 'desktop');
  assert.equal(k(UA.firefox), 'none');
  assert.equal(deviceWord({ ua: UA.iphoneSafari26 }), 'phone');
  assert.equal(deviceWord({ ua: UA.ipadDesktop, platform: 'MacIntel', touchPoints: 5 }), 'tablet');
  assert.equal(deviceWord({ ua: UA.androidTablet }), 'tablet');
  assert.equal(deviceWord({ ua: UA.winChrome }), 'computer');
  assert.equal(iosVersion(UA.iphoneSafari26), 26, 'Safari 26 says OS 18_6, so its own version wins');
  assert.equal(iosVersion(UA.iphoneSafari17), 17);
});

test('the manifest makes the board installable, full screen', () => {
  const m = manifest({}, null);
  assert.equal(m.name, 'Family Board'); assert.ok(m.short_name.length <= 12);
  assert.equal(m.display, 'standalone'); assert.equal(m.start_url, '/'); assert.equal(m.scope, '/'); assert.equal(m.id, '/');
  for (const size of ['192x192', '512x512']) for (const purpose of ['any', 'maskable']) assert.ok(m.icons.some((i) => i.sizes === size && i.purpose === purpose), `${size} ${purpose} icon`);
  for (const i of m.icons) assert.ok(existsSync(new URL('../public' + i.src, import.meta.url)), i.src);
  assert.equal(manifest({ SITE_NAME: 'Our Town Boards' }, null).name, 'Our Town Boards');
  assert.equal(manifest({ SITE_NAME: 'Our Town Boards' }, null).short_name, 'Board');
  const t = 'a'.repeat(64); assert.equal(manifest({}, t).start_url, '/?app=' + t);
  assert.equal(manifest({}, '"><script>').start_url, '/', 'only a real code goes in');
});

test('the service worker never keeps a family’s data', () => {
  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.match(sw, /pathname\.startsWith\('\/api\/'\) \|\| url\.pathname\.startsWith\('\/auth\/'\)[^\n]*return;/);
  assert.match(sw, /req\.method !== 'GET'\) return/);
  assert.match(sw, /OFFLINE = '\/offline\.html'/);
});

function fakeD1(db) {
  return { prepare(sql) { const st = db.prepare(sql); let args = []; const o = {
    bind(...a) { args = a; return o; },
    async first(col) { const r = st.get(...args); return r ? (col ? r[col] : { ...r }) : null; },
    async all() { return { results: st.all(...args).map((r) => ({ ...r })) }; },
    async run() { const r = st.run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; } }; return o; } };
}

test('a new iPhone app opens signed in to the same family, once', async (t) => {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const pub = (p) => readFileSync(new URL('../public' + (p === '/' ? '/index.html' : p), import.meta.url));
  const env = { DB: fakeD1(db), ASSETS: { fetch: async (req) => { const p = new URL(req.url).pathname; try { return new Response(pub(p), { headers: { 'content-type': p === '/' ? 'text/html' : 'text/plain' } }); } catch { return new Response('nope', { status: 404 }); } } } };
  const realFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error('no network in tests'); }; t.after(() => { globalThis.fetch = realFetch; });
  const { default: worker } = await import('../src/worker.js');
  const now = new Date().toISOString();
  db.prepare("INSERT OR IGNORE INTO households(id,name,created_at) VALUES(2,'Second',?)").run(now);
  db.prepare("INSERT INTO users(email,name,household_id,pw_hash,created_at) VALUES('two@example.com','Two',2,'google',?)").run(now);
  const tok = await A.createSession(env, { userId: 1, householdId: 2, kind: 'parent', label: 'test' });
  const call = (path, { method = 'GET', cookie = '', ua = UA.iphoneSafari26, body } = {}) => worker.fetch(new Request('https://board.test' + path, { method, headers: { cookie, 'user-agent': ua, 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4' }, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} });

  // Open to everyone, so browsers can install the app and show the offline screen.
  assert.equal((await call('/manifest.webmanifest')).status, 200);
  assert.equal(JSON.parse(await (await call('/manifest.webmanifest')).text()).display, 'standalone');
  assert.equal((await call('/sw.js')).status, 200);
  assert.match(await (await call('/offline.html')).text(), /No internet right now/);
  assert.match(await (await call('/')).text(), /Sign in/, 'everything else still needs sign-in');

  // Safari, signed in, makes a code before showing the steps.
  const { token } = JSON.parse(await (await call('/api/app/handoff', { method: 'POST', cookie: 'fbs=' + tok, body: {} })).text());
  assert.match(token, /^[0-9a-f]{64}$/);
  const page = await (await call('/?app=' + token, { cookie: 'fbs=' + tok })).text();
  assert.match(page, new RegExp(`manifest\\.webmanifest\\?app=${token}`), 'the page Safari adds carries the code in its manifest');

  // The new app opens with no cookies: it gets the opening page, which only the home-screen app uses.
  assert.match(await (await call('/?app=' + token)).text(), /Opening the app/);
  // Another kind of device can't use it.
  assert.equal((await call('/auth/app/claim', { method: 'POST', ua: UA.android, body: { t: token } })).status, 410);
  // The app from the home screen can, once.
  const r = await call('/auth/app/claim', { method: 'POST', ua: UA.iphoneApp, body: { t: token } });
  assert.equal(r.status, 200);
  const fresh = /fbs=([0-9a-f]{64})/.exec(r.headers.get('set-cookie'))[1];
  const s = await A.readSession(env, new Request('https://board.test/', { headers: { cookie: 'fbs=' + fresh } }));
  assert.equal(s.household_id, 2, 'same family'); assert.equal(s.kind, 'parent'); assert.match(s.label, /app/);
  assert.equal((await call('/auth/app/claim', { method: 'POST', ua: UA.iphoneApp, body: { t: token } })).status, 410, 'only once');

  // A code that has run out does nothing.
  const { token: old } = JSON.parse(await (await call('/api/app/handoff', { method: 'POST', cookie: 'fbs=' + tok, body: {} })).text());
  db.prepare('UPDATE app_handoffs SET expires_at=? WHERE used_at IS NULL').run('2000-01-01T00:00:00.000Z');
  assert.equal((await call('/auth/app/claim', { method: 'POST', ua: UA.iphoneApp, body: { t: old } })).status, 410);
  // Not signed in: no code.
  assert.equal((await call('/api/app/handoff', { method: 'POST', body: {} })).status, 401);
});
