// Less screen, more family time: the mascot's family idea of the day and the "Go play!" break.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { IDEAS, ideaPool, ideaOfDay, seasonOf, skyOf, playWatch, isPlayOnly, goPlayWords, PLAY_GAP } from '../public/ideas.js';
import { ideaState, ideaStep, KEEP } from '../src/lib/ideas.js';
import * as A from '../src/lib/auth.js';

const SAT = '2026-11-21', TUE = '2026-11-17', JULY_SAT = '2026-07-18';
const wx = (date, code, high, rainPct = 0) => ({ current: { code, temp: high }, days: [{ date, code, high, low: high - 15, rainPct }] });
const byId = (pool) => new Set(pool.map((x) => x.id));
const needs = (id) => IDEAS.find((x) => x[0] === id)[4];

test('every built-in idea has an id, an emoji, words and a known kind', () => {
  const ids = IDEAS.map((x) => x[0]); assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  for (const [id, emoji, text, kind] of IDEAS) { assert.ok(emoji && text.length > 10, id); assert.ok(['out', 'read', 'music', 'games', 'people', 'help', 'make', 'cook'].includes(kind), id); }
});

test('seasons follow the month, the other way round south of the equator', () => {
  assert.equal(seasonOf('2026-11-20', 39), 'fall'); assert.equal(seasonOf('2026-01-05', 39), 'winter'); assert.equal(seasonOf('2026-07-01', 39), 'summer');
  assert.equal(seasonOf('2026-07-01', -33), 'winter'); assert.equal(seasonOf('2026-12-25', -33), 'summer');
});

test('the idea fits the weather, the season and the day', () => {
  const rain = ideaPool({ today: TUE, weather: wx(TUE, 63, 55, 90), lat: 39 });
  assert.ok(!rain.some((x) => /\bout\b/.test(x.needs)), 'no dry-weather outdoor ideas in the rain'); assert.ok(byId(rain).has('puddles'), 'puddles in a warm-enough rain');
  const cold = ideaPool({ today: TUE, weather: wx(TUE, 3, 20), lat: 39 }); assert.ok(!byId(cold).has('walk') && !byId(cold).has('puddles'), 'too cold for a walk');
  const snow = ideaPool({ today: TUE, weather: wx(TUE, 73, 28), lat: 39 }); assert.ok(byId(snow).has('snowman') && byId(snow).has('sled'));
  const fine = ideaPool({ today: TUE, weather: wx(TUE, 1, 55), lat: 39 }); assert.ok(byId(fine).has('walk') && byId(fine).has('leaves'), 'a dry fall day: walks and leaf piles');
  assert.ok(!byId(fine).has('snowman') && !byId(fine).has('lemonade'), 'no snow or summer ideas'); assert.ok(!byId(fine).has('hike') && !byId(fine).has('library'), 'big ideas wait for the weekend');
  const sat = ideaPool({ today: SAT, weather: wx(SAT, 1, 55), lat: 39 }); assert.ok(byId(sat).has('hike') && byId(sat).has('library'));
  const hot = ideaPool({ today: JULY_SAT, weather: wx(JULY_SAT, 0, 86), lat: 39 }); assert.ok(byId(hot).has('water') && byId(hot).has('picnic'));
  const metric = skyOf(wx(TUE, 1, 30), TUE, 'celsius'); assert.ok(metric.warm, '30°C is warm');
  const none = ideaPool({ today: TUE, weather: null, lat: 39 }); assert.ok(byId(none).has('walk') && !byId(none).has('snowman') && !byId(none).has('puddles'), 'with no forecast: ordinary ideas only');
  assert.equal(needs('snowman'), 'snow');
});

test('every screen gets the same idea, "Another idea" moves to a different kind, and recent ones sit out', () => {
  const args = { today: TUE, weather: wx(TUE, 1, 55), lat: 39 };
  const a = ideaOfDay(args), b = ideaOfDay(args); assert.deepEqual(a, b);
  const n1 = ideaOfDay({ ...args, skip: 1 }); assert.notEqual(n1.id, a.id); assert.notEqual(n1.kind, a.kind);
  const days = new Set(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'].map((d) => ideaOfDay({ ...args, today: d, weather: wx(d, 1, 55) }).id)); assert.ok(days.size >= 4, 'different days, different ideas');
  const again = ideaOfDay({ ...args, log: [{ date: '2026-11-15', id: a.id }] }); assert.notEqual(again.id, a.id, 'done 2 days ago, so it sits out');
  const later = ideaOfDay({ ...args, log: [{ date: '2026-10-01', id: a.id }] }); assert.equal(later.id, a.id, 'done long ago, so it can come back');
});

test("the family's own ideas come up, skip bad weather when they're outside, and can stand alone", () => {
  const own = [{ id: 'a', emoji: '🪨', text: 'Skip stones at the creek', out: true }, { id: 'b', text: 'Visit Grandma Jo' }, { text: '  ' }];
  const pool = ideaPool({ today: TUE, weather: wx(TUE, 1, 55), lat: 39, own }); assert.equal(pool.filter((x) => x.id === 'own-a').length, 2, 'twice as often'); assert.ok(!pool.some((x) => x.text === ''));
  const wet = ideaPool({ today: TUE, weather: wx(TUE, 61, 55, 80), lat: 39, own }); assert.ok(!byId(wet).has('own-a') && byId(wet).has('own-b'));
  const onlyOurs = ideaPool({ today: TUE, weather: null, lat: 39, own, builtIn: false }); assert.deepEqual([...byId(onlyOurs)].sort(), ['own-a', 'own-b']);
  assert.equal(ideaOfDay({ today: TUE, weather: null, own: [], builtIn: false }), null, 'nothing to pick from');
  assert.equal(ideaPool({ today: TUE, weather: null, own }).find((x) => x.id === 'own-b').emoji, '💛', 'a default emoji');
});

test('"Go play!" waits for minutes of tapping with nothing done', () => {
  const w = playWatch(); const m = 60000; let t = 1_000_000;
  const t0 = t; for (let i = 0; i < 10; i++) { w.tap(t); t += 30000; } assert.equal(w.due(t - 30000, 5), false, '4½ minutes in'); w.tap(t); assert.equal(t - t0, 5 * m); assert.ok(w.due(t, 5), '5 minutes of tapping');
  w.did(t); assert.equal(w.due(t + 1000, 5), false, 'ticking a chore starts it over');
  const g = playWatch(); g.tap(0); g.tap(4 * m); g.tap(4 * m + PLAY_GAP + 1); assert.equal(g.due(6 * m, 5), false, 'a quiet gap starts a fresh count');
  const q = playWatch(); q.tap(0); q.tap(6 * m - 1000); assert.equal(q.due(6 * m - 1000 + PLAY_GAP + 1, 5), false, 'nobody is tapping any more');
  assert.equal(q.due(6 * m, 0), false, 'zero minutes means never');
  assert.ok(isPlayOnly('/api/wardrobe/look') && isPlayOnly('/api/wardrobe/buy') && isPlayOnly('/api/idea', { action: 'next' }));
  assert.ok(!isPlayOnly('/api/check') && !isPlayOnly('/api/grocery') && !isPlayOnly('/api/idea', { action: 'done' }) && !isPlayOnly('/api/quest/claim'));
});

test('what the mascot says when it sends everyone off', () => {
  const at = (h, m = 0) => new Date(2026, 10, 17, h, m);
  const kid = (name, today) => ({ name, leaveTime: '07:45', today });
  const idea = { emoji: '🚲', text: 'Go for a bike ride together' };
  const jobs = goPlayWords({ kids: [kid('Ava', [{ title: 'Tidy', done: false, when: 'after' }]), kid('Lily', [{ title: 'Tidy', done: true, when: 'after' }])], isSchoolDay: true, now: at(16), sleepFrom: '21:00', idea, pet: 'Biscuit' });
  assert.match(jobs.title, /Jobs first/); assert.match(jobs.text, /^Biscuit here! Ava has 1 job left\. Then: 🚲 go for a bike ride together!$/);
  const free = goPlayWords({ kids: [kid('Ava', [{ done: true }])], isSchoolDay: false, now: at(14), sleepFrom: '21:00', idea, pet: '' });
  assert.match(free.title, /go play/i); assert.equal(free.text, 'Screens off. Today’s family idea: 🚲 go for a bike ride together.', 'no pet, no pet talk');
  const bed = goPlayWords({ kids: [], isSchoolDay: false, now: at(20, 30), sleepFrom: '21:00', idea }); assert.match(bed.title, /wind down/);
  const school = goPlayWords({ kids: [kid('Ava', [{ title: 'Brush teeth', done: false, when: 'morning' }])], isSchoolDay: true, now: at(7), sleepFrom: '21:00', idea }); assert.match(school.text, /get ready for school\. Ava has 1 thing to do/);
  const noIdea = goPlayWords({ kids: [], isSchoolDay: false, now: at(14), idea: null }); assert.match(noIdea.text, /Go play outside/);
});

test("the board keeps today's idea: another one, done once, a fresh start each day", () => {
  let s = ideaState(null, TUE); assert.deepEqual(s, { date: TUE, skip: 0, done: null, log: [] });
  s = ideaStep(s, { action: 'next' }).state; assert.equal(s.skip, 1);
  const d = ideaStep(s, { action: 'done', id: 'walk', text: 'Take a walk', emoji: '🚶' }, 'now'); assert.ok(d.fresh); s = d.state; assert.equal(s.done.id, 'walk'); assert.equal(s.log[0].date, TUE);
  assert.ok(ideaStep(s, { action: 'done', id: 'walk', text: 'Take a walk' }).already, 'only once a day');
  assert.ok(ideaStep(s, { action: 'next' }).error, 'no new idea once today is done');
  assert.ok(ideaStep(ideaState(null, TUE), { action: 'done', text: ' ' }).error);
  const tomorrow = ideaState(s, '2026-11-18'); assert.equal(tomorrow.skip, 0); assert.equal(tomorrow.done, null); assert.equal(tomorrow.log.length, 1, 'the log carries over');
  let long = ideaState(null, TUE); for (let i = 0; i < 40; i++) long = ideaStep(ideaState({ ...long, date: 'x' }, `2026-01-${String(i + 1).padStart(2, '0')}`), { action: 'done', id: 'i' + i, text: 'idea ' + i }).state;
  assert.equal(long.log.length, KEEP);
});

function fakeD1(db) {
  return { prepare(sql) { const st = db.prepare(sql); let args = []; const o = {
    bind(...a) { args = a; return o; },
    async first(col) { const r = st.get(...args); return r ? (col ? r[col] : { ...r }) : null; },
    async all() { return { results: st.all(...args).map((r) => ({ ...r })) }; },
    async run() { const r = st.run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; } }; return o; } };
}
test('the real worker: every screen shares the idea, and stars only when grown-ups chose some', async (t) => {
  const db = new DatabaseSync(':memory:'); const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const ics = readFileSync(new URL('../public/sample.ics', import.meta.url), 'utf8');
  const env = { DB: fakeD1(db), ASSETS: { fetch: async () => new Response(ics) } };
  const realFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error('no network in tests'); }; t.after(() => { globalThis.fetch = realFetch; });
  const { default: worker } = await import('../src/worker.js');
  db.prepare("INSERT INTO users(email,name,household_id,pw_hash,created_at) VALUES('one@example.com','One',1,'google',?)").run(new Date().toISOString());
  const tok = await A.createSession(env, { userId: 1, householdId: 1, kind: 'parent', label: 'test' });
  const call = async (path, method = 'GET', body) => { const r = await worker.fetch(new Request('https://board.test' + path, { method, headers: { cookie: 'fbs=' + tok, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} }); return { status: r.status, ...JSON.parse(await r.text()) }; };

  const b0 = await call('/api/board'); assert.deepEqual({ skip: b0.idea.skip, done: b0.idea.done }, { skip: 0, done: null }); assert.deepEqual(b0.config.ideas, { on: true, stars: 0, builtIn: true, own: [] }); assert.deepEqual(b0.config.nudge, { on: true, minutes: 5, quiet: 15 });
  await call('/api/idea', 'POST', { action: 'next' }); assert.equal((await call('/api/board')).idea.skip, 1, 'another idea, for every screen');
  const plain = await call('/api/idea', 'POST', { action: 'done', id: 'walk', text: 'Take a walk around the block after dinner', emoji: '🚶' }); assert.equal(plain.stars, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM quest_claims WHERE title LIKE 'Family idea:%'").get().n, 0, 'no stars unless grown-ups chose some');
  assert.equal((await call('/api/board')).idea.done.id, 'walk');
  assert.equal((await call('/api/idea', 'POST', { action: 'next' })).status, 409);

  // A new day with 2 stars each, approved like a bonus quest.
  db.prepare("UPDATE settings SET value=json_set(value,'$.date','2000-01-01') WHERE key='idea'").run();
  const cfg = await call('/api/admin/config'); await call('/api/admin/config', 'PUT', { config: { ideas: { ...cfg.ideas, stars: 2 } } });
  const r = await call('/api/idea', 'POST', { action: 'done', id: 'cards', text: 'Play a card game', emoji: '🃏' }); assert.equal(r.stars, 2); assert.equal(r.status, cfg.rules.questsNeedApproval ? 'pending' : 'approved');
  const claims = db.prepare("SELECT kid, stars FROM quest_claims WHERE title='Family idea: Play a card game'").all(); assert.equal(claims.length, cfg.kids.length); assert.ok(claims.every((c) => c.stars === 2));
  await call('/api/idea', 'POST', { action: 'done', id: 'cards', text: 'Play a card game' }); assert.equal(db.prepare("SELECT COUNT(*) AS n FROM quest_claims WHERE title LIKE 'Family idea:%'").get().n, cfg.kids.length, 'only once a day');

  await call('/api/admin/config', 'PUT', { config: { ideas: { ...cfg.ideas, on: false } } }); assert.equal((await call('/api/idea', 'POST', { action: 'next' })).status, 409, 'off means off');
});
