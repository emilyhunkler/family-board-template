// Stars and pay that a kid already has shouldn't go down when grown-ups change the chores,
// and the progress chart gets what it needs for each day.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { instancesForDay, weekSummary, kidDay } from '../src/lib/points.js';
import * as A from '../src/lib/auth.js';

const EVERY = [0, 1, 2, 3, 4, 5, 6];
const base = () => ({ kids: [{ id: 'a', weeklyAllowance: 5 }, { id: 'b', weeklyAllowance: 5 }], week: { payDay: 0 }, rules: { roundTo: 0.25, starsPerDollar: 10 },
  tasks: [{ id: 'bed', title: 'Bed', who: 'both', when: 'after', days: EVERY, stars: 1 }, { id: 'set', title: 'Set the table', who: 'either', rotate: true, when: 'after', days: EVERY, stars: 1 }] });
const WK = '2026-11-16', TODAY = '2026-11-19'; // Monday to Sunday; today is Thursday
const PAST = ['2026-11-16', '2026-11-17', '2026-11-18'];

// Kid a did every chore Monday to Wednesday, and the board saved each of those days' lists.
function lastWeek() {
  const cfg = base(); const plans = {}; const checks = [];
  for (const d of PAST) { plans[d] = instancesForDay(d, cfg, []); for (const i of plans[d]) if (i.kids.includes('a')) checks.push({ date: d, kid: 'a', task: i.id }); }
  const start = weekSummary(cfg.kids[0], WK, cfg, checks, [], [], TODAY, plans).possible;
  return { cfg, plans, checks, start, before: weekSummary(cfg.kids[0], WK, cfg, checks, [], [], TODAY, plans, start) };
}

test('adding a chore on Thursday does not cut the total or add misses to earlier days', () => {
  const { plans, checks, start, before } = lastWeek(); assert.ok(before.total > 0);
  const cfg = base(); cfg.tasks.push({ id: 'dish', title: 'Dishes', who: 'both', when: 'after', days: EVERY, stars: 1 });
  const after = weekSummary(cfg.kids[0], WK, cfg, checks, [], [], TODAY, plans, start);
  assert.equal(after.total, before.total);
  assert.equal(after.misses, 0);
  assert.deepEqual(after.days.slice(0, 3).map((d) => d.status), ['full', 'full', 'full']);
  assert.ok(after.canReach >= before.canReach, 'the new chore is a chance to earn more');
});

test('adding a take-turns chore keeps turns already done with the kid who did them', () => {
  const { checks, start, before } = lastWeek();
  const cfg = base(); cfg.tasks.unshift({ id: 'feed', title: 'Feed the dog', who: 'either', rotate: true, when: 'after', days: EVERY, stars: 1 });
  // Even with no saved lists at all, a done turn stays with whoever did it.
  const noPlans = weekSummary(cfg.kids[0], WK, cfg, checks, [], [], TODAY, undefined, start);
  assert.equal(noPlans.earned, before.earned);
  const other = weekSummary(cfg.kids[1], WK, cfg, checks, [], [], TODAY);
  assert.equal(other.days.slice(0, 3).reduce((s, d) => s + d.earned, 0), 0);
  // And today's list still shows a turn she already did, after the turns move.
  const today = instancesForDay(TODAY, base(), []); const mine = today.find((i) => i.turn && i.kids[0] === 'a') || today.find((i) => i.turn);
  const ck = [{ date: TODAY, kid: mine.kids[0], task: mine.id }];
  const shifted = instancesForDay(TODAY, cfg, []); const list = kidDay(mine.kids[0], TODAY, cfg, shifted, ck);
  assert.ok(list.some((t) => t.id === mine.id && t.done));
});

test('a one-off job added during the week is a chance to earn more, never a dip', () => {
  const { cfg, plans, checks, start, before } = lastWeek();
  const todos = [{ id: 9, date: '2026-11-21', kid: 'a', title: 'Rake leaves', stars: 3 }];
  const added = weekSummary(cfg.kids[0], WK, cfg, checks, todos, [], TODAY, plans, start);
  assert.equal(added.total, before.total);
  const done = weekSummary(cfg.kids[0], WK, cfg, checks.concat({ date: '2026-11-21', kid: 'a', task: 'todo:9' }), todos, [], TODAY, plans, start);
  assert.ok(done.total > before.total);
});

test('pay never goes over the weekly allowance', () => {
  const cfg = base(); const checks = []; const plans = {};
  for (let i = 0; i < 7; i++) { const d = `2026-11-${16 + i}`; plans[d] = instancesForDay(d, cfg, []); for (const x of plans[d]) if (x.kids.includes('a')) checks.push({ date: d, kid: 'a', task: x.id }); }
  const w = weekSummary(cfg.kids[0], WK, cfg, checks.concat({ date: '2026-11-21', kid: 'a', task: 'todo:9' }), [{ id: 9, date: '2026-11-21', kid: 'a', title: 'Extra', stars: 5 }], [], '2026-11-23', plans, 10);
  assert.equal(w.total, 5);
});

test('each day says what was earned, missed and still open, with the chores behind it', () => {
  const cfg = base(); const checks = [{ date: '2026-11-16', kid: 'a', task: 'bed:a' }, { date: TODAY, kid: 'a', task: 'bed:a' }];
  const w = weekSummary(cfg.kids[0], WK, cfg, checks, [], [{ kid: 'a', status: 'approved', date: '2026-11-17', stars: 2 }], TODAY);
  const [mon, tue] = w.days; const thu = w.days[3], sun = w.days[6];
  assert.equal(mon.earned, 1); assert.equal(mon.missed, mon.possible - 1); assert.equal(mon.open, 0);
  assert.equal(tue.earned, 0); assert.equal(tue.bonus, 2);
  assert.equal(thu.open, thu.possible - 1); assert.equal(thu.missed, 0);
  assert.equal(sun.open, sun.possible);
  assert.deepEqual(mon.items.map((i) => [i.title, i.done]).find((x) => x[0] === 'Bed'), ['Bed', true]);
  assert.equal(w.left, w.days.slice(3).reduce((s, d) => s + d.open, 0));
});

// The real worker, on a throwaway database: it saves today's list and the week's bar, and a chore added later doesn't cut the total.
function fakeD1(db) {
  return { prepare(sql) { const st = db.prepare(sql); let args = []; const o = {
    bind(...a) { args = a; return o; },
    async first(col) { const r = st.get(...args); return r ? (col ? r[col] : { ...r }) : null; },
    async all() { return { results: st.all(...args).map((r) => ({ ...r })) }; },
    async run() { const r = st.run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; } }; return o; } };
}
test('the board saves each day and keeps the total steady when chores change', async (t) => {
  const db = new DatabaseSync(':memory:'); const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const ics = readFileSync(new URL('../public/sample.ics', import.meta.url), 'utf8');
  const env = { DB: fakeD1(db), ASSETS: { fetch: async () => new Response(ics) } };
  const realFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error('no network in tests'); }; t.after(() => { globalThis.fetch = realFetch; });
  const { default: worker } = await import('../src/worker.js');
  db.prepare("INSERT INTO users(email,name,household_id,pw_hash,created_at) VALUES('one@example.com','One',1,'google',?)").run(new Date().toISOString());
  const tok = await A.createSession(env, { userId: 1, householdId: 1, kind: 'parent', label: 'test' });
  const call = async (path, method = 'GET', body) => { const r = await worker.fetch(new Request('https://board.test' + path, { method, headers: { cookie: 'fbs=' + tok, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} }); return JSON.parse(await r.text()); };

  const b1 = await call('/api/board'); const k1 = b1.kids[0]; const task = k1.today.find((x) => !x.shared) || k1.today[0];
  assert.ok(db.prepare('SELECT plan FROM day_plans WHERE date=? AND household_id=1').get(b1.today), "today's list is saved");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM day_plans WHERE date<? AND date>=? AND household_id=1").get(b1.today, b1.weekStart).n, (Date.parse(b1.today) - Date.parse(b1.weekStart)) / 86400000, 'earlier days this week are saved too');
  if (task) await call('/api/check', 'POST', { kid: k1.id, id: task.id, date: b1.today, done: true });
  const before = (await call('/api/board')).kids[0].week;
  const cfg = await call('/api/admin/config');
  await call('/api/admin/config', 'PUT', { config: { tasks: [...cfg.tasks, { id: 'tnew', title: 'Feed the fish', emoji: '🐟', who: 'both', when: 'after', days: EVERY, stars: 2 }] } });
  const after = (await call('/api/board')).kids[0].week;
  assert.ok(after.possible > before.possible, 'the new chore is on the board'); assert.ok(after.total >= before.total, `${after.total} >= ${before.total}`);
  assert.deepEqual(after.days.filter((d) => d.date < b1.today).map((d) => d.missed), before.days.filter((d) => d.date < b1.today).map((d) => d.missed));
});
