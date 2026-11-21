// The Nov 21 bug check: fixes for pay, phones and settings that the board's families rely on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { mergeChanges } from '../src/lib/merge.js';
import { payWeekStart, payDayOf, withPayDayChange, weekSummary } from '../src/lib/points.js';
import { timesUpWords, TIMES_UP } from '../public/ideas.js';
import DEFAULT_CONFIG from '../src/config.default.js';
import { ymd, parts, addDaysYmd } from '../src/lib/ical.js';
import * as A from '../src/lib/auth.js';

test('a save keeps changes made elsewhere since the screen opened', () => {
  const base = { pin: '1111', weather: { units: 'fahrenheit', lat: 1 }, setup: { done: true, kidsTurn: ['a', 'b'] }, kids: [{ id: 'a', weeklyAllowance: 3 }], family: { name: 'Us', dog: '🐶' } };
  // Meanwhile: the board switched to °C and kid a finished their avatar.
  const current = { ...structuredClone(base), weather: { units: 'celsius', lat: 1 }, setup: { done: true, kidsTurn: ['b'] } };
  // This screen only changed the allowance and the pet.
  const next = structuredClone(base); next.kids[0].weeklyAllowance = 5; next.family.dog = '🐱';
  const out = mergeChanges(current, base, next);
  assert.equal(out.weather.units, 'celsius'); assert.deepEqual(out.setup.kidsTurn, ['b']);
  assert.equal(out.kids[0].weeklyAllowance, 5); assert.equal(out.family.dog, '🐱'); assert.equal(out.family.name, 'Us');
  const gone = structuredClone(base); delete gone.family.dog; assert.equal('dog' in mergeChanges(current, base, gone).family, false, 'taking something away is saved too');
});

test('a new pay day starts after the current week, so no day is paid twice or skipped', () => {
  const cfg = structuredClone(DEFAULT_CONFIG); cfg.week.payDay = 5; // Friday: weeks run Saturday to Friday
  // On Wednesday Nov 18 a grown-up picks Sunday.
  const next = structuredClone(cfg); next.week.payDay = 0; withPayDayChange(cfg, next, '2026-11-18');
  assert.deepEqual(next.week.payDayFrom, { from: '2026-11-21', prev: 5 });
  assert.equal(payWeekStart('2026-11-20', next), '2026-11-14', 'this week still ends on Friday');
  assert.equal(payDayOf(next, '2026-11-20'), 5);
  assert.equal(payWeekStart('2026-11-22', next), '2026-11-16', 'then weeks end on Sunday');
  const kid = cfg.kids[0]; const w = weekSummary(kid, '2026-11-16', next, [], [], [], '2026-11-16');
  assert.deepEqual(w.days.slice(0, 5).map((d) => d.status), ['free', 'free', 'free', 'free', 'free'], 'Monday to Friday were paid in the old week');
  assert.notEqual(w.days[5].status, 'free'); assert.equal(payWeekStart('2026-11-30', next), '2026-11-30');
  // Moving it earlier: Friday to Wednesday, on Thursday. Thursday and Friday stay in the old week.
  const earlier = structuredClone(cfg); earlier.week.payDay = 3; withPayDayChange(cfg, earlier, '2026-11-19');
  assert.equal(payWeekStart('2026-11-20', earlier), '2026-11-14');
  const w2 = weekSummary(kid, payWeekStart('2026-11-23', earlier), earlier, [], [], [], '2026-11-23');
  assert.equal(w2.weekStart, '2026-11-19'); assert.deepEqual(w2.days.slice(0, 2).map((d) => d.status), ['free', 'free']);
  // Changing it back before it starts cancels the change; a board that has never had a pay day changes at once.
  const back = structuredClone(next); back.week.payDay = 5; withPayDayChange(next, back, '2026-11-19'); assert.equal(back.week.payDayFrom, undefined);
  const fresh = structuredClone(cfg); fresh.week.payDay = 0; withPayDayChange(cfg, fresh, '2026-11-18', { now: true }); assert.equal(fresh.week.payDayFrom, undefined);
});

test('"no jobs ticked off yet" is only said when there are jobs left', () => {
  const done = [{ name: 'Ava', today: [{ done: true }] }];
  for (let i = 0; i < TIMES_UP.length * 2; i++) assert.doesNotMatch(timesUpWords({ kids: done, seed: i }).text, /ticked off/);
});

// The real worker, on a throwaway database (as in bank.test.js).
function fakeD1(db) {
  return { prepare(sql) { const st = db.prepare(sql); let args = []; const o = {
    bind(...a) { args = a; return o; },
    async first(col) { const r = st.get(...args); return r ? (col ? r[col] : { ...r }) : null; },
    async all() { return { results: st.all(...args).map((r) => ({ ...r })) }; },
    async run() { const r = st.run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; } }; return o; } };
}
async function board(t) {
  const db = new DatabaseSync(':memory:'); const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const ics = readFileSync(new URL('../public/sample.ics', import.meta.url), 'utf8');
  const env = { DB: fakeD1(db), ASSETS: { fetch: async () => new Response(ics) } };
  const realFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error('no network in tests'); }; t.after(() => { globalThis.fetch = realFetch; });
  const { default: worker } = await import('../src/worker.js');
  const now = new Date().toISOString();
  db.prepare("INSERT INTO users(email,name,household_id,pw_hash,created_at) VALUES('one@example.com','One',1,'google',?)").run(now);
  db.prepare("INSERT INTO users(email,name,household_id,pw_hash,created_at) VALUES('two@example.com','Two',1,'google',?)").run(now);
  const tok = await A.createSession(env, { userId: 1, householdId: 1, kind: 'parent', label: 'one' });
  const tok2 = await A.createSession(env, { userId: 2, householdId: 1, kind: 'parent', label: 'two' });
  const call = async (path, method = 'GET', body, who = tok) => { const r = await worker.fetch(new Request('https://board.test' + path, { method, headers: { cookie: 'fbs=' + who, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} }); const txt = await r.text(); let j = {}; try { j = JSON.parse(txt); } catch {} return { status: r.status, ...j }; };
  return { db, call, tok, tok2 };
}

test('"Mark paid" pays a week once, even with a double tap', async (t) => {
  const { db, call } = await board(t);
  const a = await call('/api/admin/payout', 'POST', { week: '2026-11-14', kid: 'kid1', amount: 3, jar: 3, note: 'weekly' });
  const b = await call('/api/admin/payout', 'POST', { week: '2026-11-14', kid: 'kid1', amount: 3, jar: 3, note: 'weekly' });
  assert.equal(a.ok, true); assert.equal(b.status, 409);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE kind='jar'").get().n, 1, 'the bank gets the money once');
});

test('a removed grown-up, or a signed-out phone, stops getting notifications', async (t) => {
  const { db, call, tok2 } = await board(t);
  const sub = (n) => ({ endpoint: 'https://push.example/' + n, keys: { p256dh: 'p', auth: 'a' } });
  await call('/api/push/subscribe', 'POST', { sub: sub(1), who: 'One' });
  await call('/api/push/subscribe', 'POST', { sub: sub(2), who: 'Two' }, tok2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE user_id IS NOT NULL AND session_id IS NOT NULL').get().n, 2);
  const phones = await call('/api/admin/phones'); assert.equal(Object.values(phones).filter((x) => x && x.who).length, 2);
  await call('/api/admin/remove-user', 'POST', { userId: 2 });
  assert.deepEqual(db.prepare('SELECT who FROM push_subs').all().map((r) => r.who), ['One']);
  // A phone from before this change can be removed by hand.
  db.prepare("INSERT INTO push_subs(endpoint,p256dh,auth,who,prefs,created_at,household_id) VALUES('https://push.example/old','p','a','Old','[]','x',1)").run();
  const old = db.prepare("SELECT id FROM push_subs WHERE who='Old'").get().id;
  await call('/api/admin/phone-remove', 'POST', { id: old }); assert.equal(db.prepare("SELECT COUNT(*) AS n FROM push_subs WHERE who='Old'").get().n, 0);
  // Signing out stops that phone's notifications.
  await call('/auth/signout', 'POST'); assert.equal(db.prepare('SELECT COUNT(*) AS n FROM push_subs').get().n, 0);
});

test('settings saved from one phone keep what changed elsewhere, and a new PIN works right after', async (t) => {
  const { call } = await board(t);
  const base = await call('/api/admin/config'); delete base.status;
  await call('/api/units', 'POST', { units: 'celsius' });
  const next = structuredClone(base); next.family.dog = '🐱'; next.pin = '4321';
  assert.equal((await call('/api/admin/config', 'PUT', { config: next, base })).ok, true);
  const now = await call('/api/admin/config'); assert.equal(now.weather.units, 'celsius', '°C stays'); assert.equal(now.family.dog, '🐱'); assert.equal(now.pin, '4321');
});

test('the parents screen sends the new PIN after changing it, and the break asks for the PIN every time', () => {
  const par = readFileSync(new URL('../public/parents.js', import.meta.url), 'utf8');
  assert.match(par, /put\('\/api\/admin\/config', \{ config: n, base: was \}, pinNow\.current\)/);
  assert.match(par, /pinNow\.current = n\.pin; if \(live\.current\) pinApi\.setPin\(n\.pin\)/);
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /onEnd\(\); return true; \}, \{ fresh: true \}\)/, '"End the break" always asks');
  assert.match(app, /onSeen=\$\{\(\) => setQuiet\(\(q\) => \(q \? \{ \.\.\.q, fresh: false \} : q\)\)\}/, '"Time\'s up!" shows once per break');
  assert.match(app, /b\.kids\.some\(\(k\) => k\.id === page\) \|\| document\.querySelector/, "a kid's own page doesn't count toward Go play");
  assert.match(app, /history\.replaceState\(null, '', location\.pathname \+ location\.search\)/, 'the page address is cleared after a notification opens a page');
});
