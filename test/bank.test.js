// Kids' bank: pay day's cash-or-bank choice, asking for cash, and a grown-up saying yes once it's handed over.
// Money a kid already has (their savings jar) must carry over as their bank balance, and a week is paid once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import * as BK from '../src/lib/bank.js';
import { ymd, parts, addDaysYmd } from '../src/lib/ical.js';
import * as A from '../src/lib/auth.js';

test('the bank balance is money in less money out, and cash already asked for is held back', () => {
  const rows = [{ kid: 'a', kind: 'jar', amount: 5 }, { kid: 'a', kind: 'cashout', amount: 1.5 }, { kid: 'a', kind: 'payout', amount: 9 }, { kid: 'b', kind: 'jar', amount: 2 }];
  const reqs = [{ kid: 'a', amount: 2, status: 'pending' }, { kid: 'a', amount: 1, status: 'denied' }];
  assert.deepEqual(BK.bankOf('a', rows, reqs), { balance: 3.5, pending: 2, available: 1.5 });
  assert.deepEqual(BK.bankOf('b', rows, reqs), { balance: 2, pending: 0, available: 2 });
});

test('pay day closes at the family\'s closing time, and only on pay day', () => {
  assert.equal(BK.payDayClosed('2026-11-20', '2026-11-20', { h: 17, mi: 59 }, '18:00'), false);
  assert.equal(BK.payDayClosed('2026-11-20', '2026-11-20', { h: 18, mi: 0 }, '18:00'), true);
  assert.equal(BK.payDayClosed('2026-11-19', '2026-11-20', { h: 20, mi: 0 }, '18:00'), false);
  assert.equal(BK.payDayClosed('2026-11-20', '2026-11-20', { h: 9, mi: 0 }, '18:00', false), true, 'a look at pay day on another date');
});

test('pay not collected on the night waits, oldest first, and a paid week never comes back', () => {
  const snaps = { '2026-11-07': { kids: { a: { total: 4, base: 3, bonus: 1 } } }, '2026-11-14': { kids: { a: { total: 5, base: 5, bonus: 0 }, b: { total: 0 } } } };
  const week = { total: 2, base: 2, bonusDollars: 0 };
  const due = BK.dueFor('a', { wk: '2026-11-21', closed: true, week, snaps, paidWeeks: new Set(['2026-11-07']) });
  assert.deepEqual(due.map((d) => [d.week, d.total]), [['2026-11-14', 5], ['2026-11-21', 2]]);
  assert.equal(due[0].payDay, '2026-11-20');
  assert.deepEqual(BK.dueFor('b', { wk: '2026-11-21', closed: false, week, snaps, paidWeeks: new Set() }), [], 'nothing earned, nothing to collect');
  let s = {}; for (let i = 0; i < 9; i++) s = BK.withSnapshot(s, addDaysYmd('2026-09-05', 7 * i), {}, 'x');
  assert.equal(Object.keys(s).length, BK.KEEP_WEEKS);
});

// The real worker, on a throwaway database.
function fakeD1(db) {
  return { prepare(sql) { const st = db.prepare(sql); let args = []; const o = {
    bind(...a) { args = a; return o; },
    async first(col) { const r = st.get(...args); return r ? (col ? r[col] : { ...r }) : null; },
    async all() { return { results: st.all(...args).map((r) => ({ ...r })) }; },
    async run() { const r = st.run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; } }; return o; } };
}
async function board(t, upTo = 99) {
  const db = new DatabaseSync(':memory:'); const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) if (parseInt(f, 10) <= upTo) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const ics = readFileSync(new URL('../public/sample.ics', import.meta.url), 'utf8');
  const env = { DB: fakeD1(db), ASSETS: { fetch: async () => new Response(ics) } };
  const realFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error('no network in tests'); }; t.after(() => { globalThis.fetch = realFetch; });
  const { default: worker } = await import('../src/worker.js');
  db.prepare("INSERT INTO users(email,name,household_id,pw_hash,created_at) VALUES('one@example.com','One',1,'google',?)").run(new Date().toISOString());
  const tok = await A.createSession(env, { userId: 1, householdId: 1, kind: 'parent', label: 'test' });
  const call = async (path, method = 'GET', body) => { const r = await worker.fetch(new Request('https://board.test' + path, { method, headers: { cookie: 'fbs=' + tok, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} }); return { status: r.status, ...JSON.parse(await r.text()) }; };
  // Pay day is today and has already closed. No chores, so each kid's pay is just their bonus stars (10 stars = $1).
  const cfg = await call('/api/admin/config'); const zone = cfg.zone; const today = ymd(new Date(), zone);
  await call('/api/admin/config', 'PUT', { config: { tasks: [], week: { ...cfg.week, payDay: parts(new Date(), zone).wd, closesAt: '00:00' } } });
  const claim = (kid, stars) => db.prepare("INSERT INTO quest_claims(date,kid,quest,title,stars,status,claimed_at,household_id) VALUES(?,?,'q','Helped',?,'approved',?,1)").run(today, kid, stars, new Date().toISOString());
  return { db, call, today, claim };
}

test('pay day: bank it or cash please, each week once, and savings carry over', async (t) => {
  const { db, call, today, claim } = await board(t);
  // A savings jar from before the bank existed.
  db.prepare("INSERT INTO ledger(week,kid,kind,amount,stars,note,created_at,household_id) VALUES('2026-01-05','kid1','jar',2.5,0,'to savings jar','2026-01-11T00:00:00Z',1)").run();
  claim('kid1', 30); claim('kid2', 20);
  let b = await call('/api/board'); const [a, s] = b.kids;
  assert.equal(b.payDay, today); assert.ok(b.payDayClosed);
  assert.equal(a.week.total, 3); assert.equal(a.payday.total, 3); assert.equal(a.payday.week, b.weekStart);
  assert.equal(a.bank.balance, 2.5, 'the old savings jar is the opening balance'); assert.equal(s.payday.total, 2);

  // Pay day's totals are saved, so the day after the kids can still collect.
  const next = await call('/api/board?date=' + addDaysYmd(today, 1));
  assert.equal(next.kids[1].payday?.week, b.weekStart); assert.equal(next.kids[1].payday.total, 2);

  const r = await call('/api/bank/payday', 'POST', { kid: 'kid1', week: a.payday.week, choice: 'bank' });
  assert.equal(r.ok, true); assert.equal(r.amount, 3); assert.equal(r.balance, 5.5);
  assert.equal((await call('/api/bank/payday', 'POST', { kid: 'kid1', week: a.payday.week, choice: 'bank' })).status, 409, 'a week is collected once');
  b = await call('/api/board');
  assert.equal(b.kids[0].payday, null); assert.equal(b.kids[0].bank.balance, 5.5); assert.equal(b.kids[0].week.total, 3, "this week's pay doesn't change");
  assert.deepEqual(b.kids[0].bank.history.map((h) => [h.dir, h.amount]), [['in', 3], ['in', 2.5]]);

  // Cash please: it goes in the bank and is asked for straight away.
  const c = await call('/api/bank/payday', 'POST', { kid: 'kid2', week: s.payday.week, choice: 'cash' });
  assert.equal(c.asked, true);
  b = await call('/api/board'); const k2 = b.kids[1];
  assert.deepEqual([k2.bank.balance, k2.bank.pending, k2.bank.available], [2, 2, 0]);
  assert.equal((await call('/api/bank/request', 'POST', { kid: 'kid2', amount: 1 })).status, 409, "can't ask for the same money twice");
  const rq = k2.bank.requests.find((x) => x.status === 'pending');
  assert.equal((await call('/api/bank/decide', 'POST', { id: rq.id, approve: true })).ok, true);
  assert.equal((await call('/api/bank/decide', 'POST', { id: rq.id, approve: true })).status, 409, 'two taps take it out once');
  b = await call('/api/board'); assert.deepEqual([b.kids[1].bank.balance, b.kids[1].bank.pending], [0, 0]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE kind='cashout'").get().n, 1);

  // Asking for cash any time: up to what's there; a "not now" leaves it in the bank.
  assert.equal((await call('/api/bank/request', 'POST', { kid: 'kid1', amount: 10 })).status, 409);
  assert.equal((await call('/api/bank/request', 'POST', { kid: 'kid1', amount: 1.5 })).ok, true);
  b = await call('/api/board'); assert.equal(b.kids[0].bank.available, 4);
  await call('/api/bank/decide', 'POST', { id: b.kids[0].bank.requests[0].id, approve: false });
  b = await call('/api/board'); assert.deepEqual([b.kids[0].bank.balance, b.kids[0].bank.available], [5.5, 5.5]);
});

test('a grown-up marking the week paid means the board does not ask', async (t) => {
  const { call, claim } = await board(t);
  claim('kid1', 30); let b = await call('/api/board');
  await call('/api/admin/payout', 'POST', { week: b.kids[0].payday.week, kid: 'kid1', amount: 3, jar: 0, note: 'weekly' });
  b = await call('/api/board'); assert.equal(b.kids[0].payday, null); assert.equal(b.kids[0].bank.balance, 0);
});

test('with the bank turned off, pay day works as before', async (t) => {
  const { call, claim } = await board(t);
  claim('kid1', 30); await call('/api/admin/config', 'PUT', { config: { bank: { on: false } } });
  const b = await call('/api/board'); assert.equal(b.kids[0].payday, null); assert.equal(b.kids[0].bank.on, false); assert.equal(b.kids[0].week.total, 3);
  assert.notEqual((await call('/api/bank/payday', 'POST', { kid: 'kid1', choice: 'bank' })).ok, true);
  assert.notEqual((await call('/api/bank/request', 'POST', { kid: 'kid1', amount: 1 })).ok, true);
});

test('before the new table is added, the board still loads', async (t) => {
  const { call, claim } = await board(t, 9);
  claim('kid1', 30); const b = await call('/api/board');
  assert.equal(b.kids[0].week.total, 3); assert.deepEqual(b.kids[0].bank.requests, []);
  assert.equal((await call('/api/bank/request', 'POST', { kid: 'kid1', amount: 1 })).status, 503);
});
