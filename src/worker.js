import defaults from './config.default.js';
import { upgradeWardrobe } from './lib/wardrobe.js';
import { parseICS, expandEvents, ymd, addDaysYmd, parts, zoned } from './lib/ical.js';
import * as P from './lib/points.js';
import * as H from './lib/helpers.js';
import { interpret } from './lib/voice.js';
import { makeVapid, sendPush } from './lib/push.js';
import * as A from './lib/auth.js';
import * as O from './lib/onboard.js';
import * as AC from './lib/account.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const err = (msg, status = 400, extra = {}) => json({ error: msg, ...extra }, status);
const nowIso = () => new Date().toISOString();
const uid = () => Math.random().toString(36).slice(2, 10);

// ---------- config ----------
// Weather is cached per place and units, so moving the board's home town shows the new forecast at once.
const wxKey = (cfg) => `weather:${cfg.weather.units || 'fahrenheit'}:${cfg.weather.lat},${cfg.weather.lon}`;
async function getConfig(env) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key=? AND household_id=?').bind('config', env.HID).first();
  if (!row) { await saveConfig(env, defaults); return structuredClone(defaults); }
  const c = JSON.parse(row.value);
  // Boards saved before first-run setup existed were set up by hand, so they never see the wizard.
  if (c.setup === undefined) c.setup = { done: true };
  for (const k of Object.keys(defaults)) if (c[k] === undefined) c[k] = structuredClone(defaults[k]);
  // One-time upgrades for boards saved before a setting existed.
  if (!c.family.groupWords) { c.family.groupWords = [...defaults.family.groupWords]; await saveConfig(env, c); }
  if (upgradeWardrobe(c)) await saveConfig(env, c);
  return c;
}
async function saveConfig(env, cfg) { await env.DB.prepare('INSERT INTO settings(key,value,updated_at,household_id) VALUES(?,?,?,?) ON CONFLICT(household_id,key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at').bind('config', JSON.stringify(cfg), nowIso(), env.HID).run(); }
function publicConfig(cfg) {
  const c = structuredClone(cfg); delete c.pin;
  c.calendars = c.calendars.map((x) => ({ ...x, url: undefined, hasUrl: !!x.url }));
  return c;
}
async function getSetting(env, key, dflt) { const r = await env.DB.prepare('SELECT value FROM settings WHERE key=? AND household_id=?').bind(key, env.HID).first(); return r ? JSON.parse(r.value) : dflt; }
async function setSetting(env, key, val) { await env.DB.prepare('INSERT INTO settings(key,value,updated_at,household_id) VALUES(?,?,?,?) ON CONFLICT(household_id,key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at').bind(key, JSON.stringify(val), nowIso(), env.HID).run(); }
// Admin (Parents) access is decided once per request: a parent's own signed-in device, or the right PIN (guesses limited).
const ADMIN = new WeakMap();
const pinOk = (req) => ADMIN.get(req)?.ok === true;
function denyAdmin(req) { const a = ADMIN.get(req); return a?.lockedMin ? json({ error: `Too many wrong PINs. Try again in ${a.lockedMin} minute${a.lockedMin === 1 ? '' : 's'}.`, needPin: true, locked: true }, 429) : json({ error: 'PIN', needPin: true }, 403); }
async function decideAdmin(env, req, body, cfg, session, userCount = 1) {
  if (session?.kind === 'parent') return { ok: true, via: 'account' };
  // A brand-new board, before anyone has signed up: whoever got past the setup code is setting it up.
  if (!userCount && cfg.setup?.done === false) return { ok: true, via: 'setup' };
  const given = req.headers.get('x-pin') || body?.pin; if (!given) return { ok: false };
  const key = env.HID + ':pin:' + (session?.id || req.headers.get('cf-connecting-ip') || 'local'); const locked = await A.check(env, key, 5); if (locked) return { ok: false, lockedMin: locked };
  if (A.sameString(String(given), String(cfg.pin))) { await A.clearLimit(env, key); return { ok: true, via: 'pin' }; }
  await A.fail(env, key, 15 * 60); const after = await A.check(env, key, 5); return { ok: false, lockedMin: after || 0 };
}
async function log(env, kind, kid, text) { await env.DB.prepare('INSERT INTO events_log(at,kind,kid,text,household_id) VALUES(?,?,?,?,?)').bind(nowIso(), kind, kid || null, text, env.HID).run(); }

// ---------- cache ----------
async function cached(env, key, maxAgeMs, fn, force = false) {
  const row = await env.DB.prepare('SELECT value, fetched_at FROM cache WHERE key=? AND household_id=?').bind(key, env.HID).first();
  if (row && !force && Date.now() - Date.parse(row.fetched_at) < maxAgeMs) return JSON.parse(row.value);
  try { const v = await fn(); await env.DB.prepare('INSERT INTO cache(key,value,fetched_at,household_id) VALUES(?,?,?,?) ON CONFLICT(household_id,key) DO UPDATE SET value=excluded.value, fetched_at=excluded.fetched_at').bind(key, JSON.stringify(v), nowIso(), env.HID).run(); return v; }
  catch (e) { if (row) return JSON.parse(row.value); throw e; }
}

// ---------- calendars ----------
async function loadIcs(env, url, req) {
  if (url === 'sample') { const r = await env.ASSETS.fetch(new Request(new URL('/sample.ics', req.url))); const cfg = await getConfig(env); const k = cfg.kids || [], p = cfg.family.parents || [];
    // Sample events use this family's own names, so the board looks like theirs before a calendar is linked.
    return (await r.text()).replace(/\{kid1\}/g, k[0]?.name || 'Alex').replace(/\{kid2\}/g, k[1]?.name || k[0]?.name || 'Sam').replace(/\{parent1\}/g, p[0]?.name || 'Mom').replace(/\{parent2\}/g, p[1]?.name || p[0]?.name || 'Dad'); }
  const r = await fetch(url, { headers: { 'User-Agent': 'family-board/1.0' } }); if (!r.ok) throw new Error('calendar ' + r.status); return r.text();
}
async function getEvents(env, cfg, req, force = false) {
  const zone = cfg.zone; const today = ymd(new Date(), zone);
  const from = zoned(...addDaysYmd(today, -7).split('-').map(Number), 0, 0, 0, zone); const to = zoned(...addDaysYmd(today, 62).split('-').map(Number), 0, 0, 0, zone);
  const cals = cfg.calendars.filter((c) => c.enabled !== false && c.url); const sample = cals.length === 0;
  const list = sample ? [{ ...cfg.calendars[0], url: 'sample' }] : cals; let all = []; const status = {};
  for (const cal of list) {
    try {
      const evs = await cached(env, 'cal:' + cal.id, 15 * 60 * 1000, async () => { const text = await loadIcs(env, cal.url, req); return expandEvents(parseICS(text, zone), from, to, zone, { calendar: cal.id }); }, force);
      status[cal.id] = 'ok'; all = all.concat(evs.map((e) => ({ ...e, color: cal.color, owner: cal.owner })));
    } catch (e) { status[cal.id] = 'error: ' + e.message; }
  }
  // dedupe (same uid in two calendars)
  const seen = new Set(); all = all.filter((e) => { const k = e.id + '|' + e.start; if (seen.has(k)) return false; seen.add(k); return true; });
  all.sort((a, b) => a.start.localeCompare(b.start) || (a.allDay ? -1 : 1));
  return { events: all.map((e) => decorate(e, cfg)), status, sample };
}
function decorate(e, cfg) {
  const zone = cfg.zone; const people = H.eventPeople(e, cfg); const place = H.placeFor(e, cfg); const date = ymd(new Date(e.start), zone);
  const out = { ...e, date, endDate: ymd(new Date(new Date(e.end).getTime() - 1), zone), people, emoji: H.eventEmoji(e.title), timeLabel: e.allDay ? 'all day' : H.hhmm(e.start, zone), endLabel: e.allDay ? '' : H.hhmm(e.end, zone) };
  const kid = cfg.kids.find((k) => people.includes(k.id)); const par = cfg.family.parents.find((p) => people.includes(p.id));
  const ppl = [...cfg.kids.filter((k) => people.includes(k.id)), ...cfg.family.parents.filter((p2) => people.includes(p2.id))];
  out.color = kid ? kid.color : par ? par.color : e.color; out.who = ppl.length ? ppl.map((x) => x.name).join(' and ').replace(/ and (?=.* and )/g, ', ') : 'Family';
  out.dots = ppl.map((x) => ({ letter: x.name[0], color: x.color, name: x.name }));
  if (place && !e.allDay) { const lead = (P.num(place.driveMin, 0) + P.num(place.bufferMin, 0)) * 60000; out.place = { ...place, leaveBy: H.hhmm(new Date(new Date(e.start).getTime() - lead), zone), leaveAt: new Date(new Date(e.start).getTime() - lead).toISOString() }; }
  return out;
}

// ---------- board ----------
async function board(env, cfg, req, url) {
  const zone = cfg.zone; const now = new Date(); const today = url.searchParams.get('date') || ymd(now, zone);
  const wk = P.payWeekStart(today, cfg); const calWeekStart = P.weekStart(today, cfg.week.startsOn); const since = addDaysYmd(today, -100);
  const [evs, weather, checks, todos, claims, ledger, groceries, meals, notes, logs] = await Promise.all([
    getEvents(env, cfg, req).catch((e) => ({ events: [], status: { all: e.message }, sample: false })),
    cached(env, wxKey(cfg), 30 * 60 * 1000, () => H.fetchWeather(cfg)).catch(() => null),
    env.DB.prepare('SELECT * FROM checks WHERE date>=? AND household_id=? ORDER BY done_at').bind(since, env.HID).all().then((r) => r.results),
    env.DB.prepare('SELECT * FROM todos WHERE date>=? AND date<=? AND household_id=? ORDER BY date').bind(addDaysYmd(today, -14), addDaysYmd(today, 45), env.HID).all().then((r) => r.results),
    env.DB.prepare("SELECT * FROM quest_claims WHERE (date>=? OR status='pending') AND household_id=? ORDER BY claimed_at DESC").bind(wk, env.HID).all().then((r) => r.results),
    env.DB.prepare('SELECT kid, kind, SUM(stars) AS stars, SUM(amount) AS amount FROM ledger WHERE household_id=? GROUP BY kid, kind').bind(env.HID).all().then((r) => r.results),
    env.DB.prepare('SELECT * FROM groceries WHERE household_id=? ORDER BY done, added_at').bind(env.HID).all().then((r) => r.results),
    env.DB.prepare('SELECT * FROM meals WHERE date>=? AND date<=? AND household_id=?').bind(addDaysYmd(today, -7), addDaysYmd(today, 21), env.HID).all().then((r) => r.results),
    env.DB.prepare('SELECT * FROM notes WHERE (expires_at IS NULL OR expires_at>?) AND household_id=? ORDER BY created_at DESC').bind(nowIso(), env.HID).all().then((r) => r.results),
    env.DB.prepare('SELECT * FROM events_log WHERE household_id=? ORDER BY id DESC LIMIT 30').bind(env.HID).all().then((r) => r.results),
  ]);
  const quizRuns = await env.DB.prepare('SELECT id, date, week, kid, subject, grade, score, total, stars, missed, asked FROM quiz_runs WHERE date>=? AND household_id=? ORDER BY id DESC').bind(addDaysYmd(today, -120), env.HID).all().then((r) => r.results).catch(() => []);
  const rewardReqs = (await env.DB.prepare("SELECT * FROM reward_requests WHERE (status='pending' OR requested_at>?) AND household_id=? ORDER BY id DESC").bind(new Date(Date.now() - 14 * 86400000).toISOString(), env.HID).all()).results;
  const photoIds = cfg.photos?.onScreensaver === false ? [] : (await env.DB.prepare('SELECT id FROM photos WHERE hidden=0 AND household_id=? ORDER BY id DESC LIMIT 300').bind(env.HID).all()).results.map((r) => r.id);
  const lifetimeApproved = await env.DB.prepare("SELECT kid, SUM(stars) AS s FROM quest_claims WHERE status='approved' AND household_id=? GROUP BY kid").bind(env.HID).all().then((r) => Object.fromEntries(r.results.map((x) => [x.kid, x.s])));
  const lifetimeChecks = await env.DB.prepare('SELECT kid, SUM(points) AS s FROM checks WHERE household_id=? GROUP BY kid').bind(env.HID).all().then((r) => Object.fromEntries(r.results.map((x) => [x.kid, x.s])));
  const openTodos = todos.filter((t) => !t.done_at); const instToday = P.instancesForDay(today, cfg, openTodos.concat(todos.filter((t) => t.done_at && t.date === today)));
  const dayWx = weather?.days?.find((d) => d.date === today); const tip = weather ? H.weatherTip(cfg, dayWx, weather.current) : '';
  const kids = [];
  for (const k of cfg.kids) {
    const allTodos = todos; const dayList = P.kidDay(k.id, today, cfg, instToday, checks);
    const week = P.weekSummary(k, wk, cfg, checks, allTodos, claims, today); const st = P.streak(k, cfg, checks, allTodos, today);
    const lifetime = (lifetimeChecks[k.id] || 0) + (lifetimeApproved[k.id] || 0) + ledger.filter((l) => l.kid === k.id && l.kind === 'grant').reduce((s, l) => s + l.stars, 0);
    const spent = ledger.filter((l) => l.kid === k.id && (l.kind === 'wardrobe' || l.kind === 'reward')).reduce((s, l) => s + l.stars, 0);
    const ward = await getSetting(env, 'wardrobe:' + k.id, { owned: [], look: {} });
    const jar = ledger.filter((l) => l.kid === k.id && l.kind === 'jar').reduce((s, l) => s + l.amount, 0);
    kids.push({ ...k, today: dayList, week, streak: st, lifetime, level: P.level(lifetime, cfg), wardrobe: { ...ward, balance: lifetime - spent, spent }, jar, goal: await getSetting(env, 'goal:' + k.id, null),
      quiz: quizState(cfg, k, quizRuns.filter((q) => q.kid === k.id), wk),
      rewardRequests: rewardReqs.filter((r) => r.kid === k.id), pendingClaims: claims.filter((c) => c.kid === k.id && c.status === 'pending'), weekClaims: claims.filter((c) => c.kid === k.id && c.date >= wk) });
  }
  const turnText = instToday.filter((i) => i.turn).map((i) => `${cfg.kids.find((k) => k.id === i.kids[0])?.name} has ${i.title.toLowerCase()} today`).join('. ');
  return { version: env.CF_VERSION_METADATA?.id || 'dev', now: now.toISOString(), today, zone, weekStart: wk, calWeekStart, payDay: addDaysYmd(wk, 6), isSchoolDay: P.isSchoolDay(today, cfg), tomorrowSchool: P.isSchoolDay(addDaysYmd(today, 1), cfg),
    config: publicConfig(cfg), weather, tip, events: evs.events, rewardRequests: rewardReqs, photoIds, calendarStatus: evs.status, sampleData: evs.sample, kids, todos, claims, groceries, meals, notes, turnText, recent: logs, instancesToday: instToday };
}

// ---------- mutations ----------
async function doCheck(env, cfg, body, req) {
  const { kid, id, date, done } = body; if (!kid || !id || !date) return err('kid, id, date required');
  const todos = await env.DB.prepare('SELECT * FROM todos WHERE date=? AND household_id=?').bind(date, env.HID).all().then((r) => r.results);
  const inst = P.instancesForDay(date, cfg, todos).find((i) => i.id === id); if (!inst) return err('no such task today', 404);
  if (!inst.kids.includes(kid)) return err('not this kid\'s task', 403);
  const existing = await env.DB.prepare('SELECT * FROM checks WHERE date=? AND task=? AND household_id=?').bind(date, id, env.HID).first();
  if (done) {
    if (existing) return existing.kid === kid ? json({ ok: true, already: true }) : err('already done by ' + existing.kid, 409, { doneBy: existing.kid });
    await env.DB.prepare('INSERT INTO checks(date,kid,task,points,kind,done_at,by,household_id) VALUES(?,?,?,?,?,?,?,?)').bind(date, kid, id, inst.stars, inst.kind, nowIso(), body.by || 'tap', env.HID).run();
    if (inst.todoId) await env.DB.prepare('UPDATE todos SET done_at=?, done_by=? WHERE id=? AND household_id=?').bind(nowIso(), kid, inst.todoId, env.HID).run();
    const kname = cfg.kids.find((k) => k.id === kid)?.name || kid; await log(env, 'check', kid, `${kname} finished ${inst.title}`);
    const all = P.instancesForDay(date, cfg, todos).filter((i) => i.kids.includes(kid) && !i.shared); const doneIds = new Set((await env.DB.prepare('SELECT task FROM checks WHERE date=? AND kid=? AND household_id=?').bind(date, kid, env.HID).all()).results.map((r) => r.task));
    if (all.length && all.every((i) => doneIds.has(i.id))) await notify(env, 'done', `${kname} finished everything today 🎉`, `${all.length} tasks, ${all.reduce((s, i) => s + i.stars, 0)} stars`);
    return json({ ok: true, stars: inst.stars });
  }
  if (!existing) return json({ ok: true });
  const age = Date.now() - Date.parse(existing.done_at);
  if (age > P.num(cfg.rules.undoSeconds, 10) * 1000 && !pinOk(req)) return denyAdmin(req);
  await env.DB.prepare('DELETE FROM checks WHERE id=? AND household_id=?').bind(existing.id, env.HID).run();
  if (inst.todoId) await env.DB.prepare('UPDATE todos SET done_at=NULL, done_by=NULL WHERE id=? AND household_id=?').bind(inst.todoId, env.HID).run();
  return json({ ok: true, undone: true });
}
async function addGroceries(env, text, by) {
  const items = String(text).split(/,|\band\b|\n/).map((s) => s.trim()).filter(Boolean); const out = [];
  for (const it of items) {
    const dup = await env.DB.prepare('SELECT id FROM groceries WHERE done=0 AND lower(text)=lower(?) AND household_id=?').bind(it, env.HID).first(); if (dup) { out.push(dup.id); continue; }
    const r = await env.DB.prepare('INSERT INTO groceries(text,aisle,added_by,added_at,household_id) VALUES(?,?,?,?,?)').bind(it, H.aisleFor(it), by || null, nowIso(), env.HID).run(); out.push(r.meta.last_row_id);
  }
  return out;
}
// Brain quests: how many are left this week, recent scores (for the level nudge and the grown-ups' summary),
// and recently asked questions so the bank doesn't repeat itself.
const quizGradeFor = (k) => Math.max(1, Math.min(8, P.num(k.quizGrade, Math.max(1, Math.min(8, P.num(k.age, 8) - 5)))));
function quizState(cfg, k, runs, wk) {
  const q = cfg.quiz || {}; const week = runs.filter((r) => r.week === wk); const per = P.num(q.perWeek, 3);
  const parse = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };
  return { on: q.enabled !== false, grade: quizGradeFor(k), perWeek: per, left: Math.max(0, per - week.length), questions: P.num(q.questions, 5), starsEach: P.num(q.starsEach, 1), perfectBonus: P.num(q.perfectBonus, 1), region: q.region || 'us',
    week: week.map((r) => ({ subject: r.subject, score: r.score, total: r.total, stars: r.stars, date: r.date, missed: parse(r.missed) })),
    recent: runs.slice(0, 5).map((r) => ({ score: r.score, total: r.total, grade: r.grade })), asked: runs.slice(0, 40).flatMap((r) => parse(r.asked)) };
}
async function finishQuiz(env, cfg, body, today) {
  const k = cfg.kids.find((x) => x.id === body.kid); if (!k) return err('Unknown kid', 404); const q = cfg.quiz || {}; if (q.enabled === false) return err('Brain quests are turned off', 403);
  const wk = P.payWeekStart(today, cfg); const done = await env.DB.prepare('SELECT count(*) AS n FROM quiz_runs WHERE kid=? AND week=? AND household_id=?').bind(k.id, wk, env.HID).first();
  if ((done?.n || 0) >= P.num(q.perWeek, 3)) return err('No brain quests left this week. More next week!', 409);
  const n = P.num(q.questions, 5); const results = (Array.isArray(body.results) ? body.results : []).slice(0, n); if (results.length < Math.min(3, n)) return err('Finish the quiz first', 400);
  const subject = ['math', 'science', 'social', 'mix'].includes(body.subject) ? body.subject : 'mix'; const score = results.filter((r) => r.ok === true).length; const total = results.length;
  const stars = score * P.num(q.starsEach, 1) + (score === total ? P.num(q.perfectBonus, 1) : 0);
  const missed = [...new Set(results.filter((r) => !r.ok).map((r) => String(r.topic || '').slice(0, 40)).filter(Boolean))]; const asked = results.map((r) => r.id).filter((x) => typeof x === 'string').slice(0, n);
  const label = { math: 'Math', science: 'Science', social: 'Social studies', mix: 'Surprise mix' }[subject];
  await env.DB.prepare('INSERT INTO quiz_runs(date,week,kid,subject,grade,score,total,stars,missed,asked,created_at,household_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(today, wk, k.id, subject, P.num(body.grade, quizGradeFor(k)), score, total, stars, JSON.stringify(missed), JSON.stringify(asked), nowIso(), env.HID).run();
  if (stars > 0) await env.DB.prepare('INSERT INTO quest_claims(date,kid,quest,title,stars,status,claimed_at,decided_at,household_id) VALUES(?,?,?,?,?,?,?,?,?)').bind(today, k.id, 'brain:' + subject, `🧠 Brain quest: ${label} ${score}/${total}`, stars, 'approved', nowIso(), nowIso(), env.HID).run();
  await log(env, 'quiz', k.id, `${k.name} got ${score}/${total} on a ${label.toLowerCase()} brain quest`);
  return json({ ok: true, score, total, stars });
}
async function claimQuest(env, cfg, kid, questId, title, stars, today) {
  const q = (cfg.quests || []).find((x) => x.id === questId); const t = q ? q.title : title; const s = q ? q.stars : P.num(stars, 1); if (!t) return err('quest not found', 404);
  const dup = await env.DB.prepare("SELECT id FROM quest_claims WHERE date=? AND kid=? AND title=? AND status!='denied' AND household_id=?").bind(today, kid, t, env.HID).first(); if (dup) return err('already claimed today', 409);
  const status = cfg.rules.questsNeedApproval ? 'pending' : 'approved';
  await env.DB.prepare('INSERT INTO quest_claims(date,kid,quest,title,stars,status,claimed_at,decided_at,household_id) VALUES(?,?,?,?,?,?,?,?,?)').bind(today, kid, q?.id || null, t, s, status, nowIso(), status === 'approved' ? nowIso() : null, env.HID).run();
  await log(env, 'quest', kid, `${cfg.kids.find((k) => k.id === kid)?.name} claimed ${t}`);
  if (status === 'pending') await notify(env, 'quest', `${cfg.kids.find((k) => k.id === kid)?.name} claimed a quest`, `${t} · ★ ${s}. Tap to approve.`);
  return json({ ok: true, status });
}
async function execVoice(env, cfg, res, body, req, snapshot) {
  const today = snapshot.today; const p = res.params || {};
  switch (res.intent) {
    case 'grocery.add': await addGroceries(env, p.items, body.speaker || 'voice'); break;
    case 'grocery.remove': await env.DB.prepare('UPDATE groceries SET done=1, done_at=? WHERE done=0 AND lower(text) LIKE ? AND household_id=?').bind(nowIso(), '%' + p.item.toLowerCase() + '%', env.HID).run(); break;
    case 'meal.set': await env.DB.prepare('INSERT INTO meals(date,text,who,emoji,household_id) VALUES(?,?,?,?,?) ON CONFLICT(household_id,date) DO UPDATE SET text=excluded.text, who=excluded.who').bind(p.date, p.text, body.speaker || null, mealEmoji(p.text), env.HID).run(); break;
    case 'note.add': await env.DB.prepare('INSERT INTO notes(text,from_who,created_at,expires_at,household_id) VALUES(?,?,?,?,?)').bind(p.text, body.speaker || 'voice', nowIso(), new Date(Date.now() + 3 * 86400000).toISOString(), env.HID).run(); break;
    case 'todo.add': await env.DB.prepare('INSERT INTO todos(date,kid,title,stars,created_at,household_id) VALUES(?,?,?,?,?,?)').bind(p.date, p.kid, p.title, 1, nowIso(), env.HID).run(); break;
    case 'task.check': if (p.id) { const r = await doCheck(env, cfg, { kid: p.kid, id: p.id, date: today, done: true, by: 'voice' }, req); if (r.status >= 400) res.say = 'I could not check that off.'; } break;
    case 'quest.claim': if (p.questId) await claimQuest(env, cfg, p.kid, p.questId, null, null, today); break;
    case 'quest.approve': if (!pinOk(req)) return { ...res, needPin: true, say: 'Say or enter the PIN to approve.' }; { const c = await env.DB.prepare("SELECT * FROM quest_claims WHERE kid=? AND status='pending' AND household_id=? ORDER BY id DESC").bind(p.kid, env.HID).first(); if (c) { await env.DB.prepare("UPDATE quest_claims SET status='approved', decided_at=? WHERE id=? AND household_id=?").bind(nowIso(), c.id, env.HID).run(); res.say = `Approved ${c.title} for ${c.stars} stars.`; } else res.say = 'No quest waiting.'; } break;
    case 'quest.add': if (!pinOk(req)) return { ...res, needPin: true }; cfg.quests.push({ id: 'q' + uid(), title: p.title, emoji: '⭐', stars: p.stars, who: 'both' }); await saveConfig(env, cfg); break;
    case 'unknown': if (cfg.voice.ai && env.ANTHROPIC_API_KEY) { const ai = await aiInterpret(env, cfg, p.text, snapshot); if (ai && ai.intent !== 'unknown') return execVoice(env, cfg, ai, body, req, snapshot); } res.say = `Sorry, I didn't catch that. Try: add milk to the list, what's next, or ${cfg.kids[0]?.name || 'Sam'} made the bed.`; break;
  }
  return res;
}
function mealEmoji(t) { t = t.toLowerCase(); const m = [[/taco|burrito|quesadilla/, '🌮'], [/pizza/, '🍕'], [/pasta|spaghetti|noodle|mac/, '🍝'], [/burger/, '🍔'], [/chicken/, '🍗'], [/soup|chili|stew/, '🍲'], [/salad/, '🥗'], [/fish|salmon|shrimp/, '🐟'], [/rice|curry|paella/, '🍛'], [/sandwich|wrap/, '🥪'], [/breakfast|pancake|waffle|egg/, '🥞'], [/leftover/, '♻️'], [/out|restaurant|order/, '🍽️'], [/steak|beef/, '🥩'], [/sushi/, '🍣'], [/hot ?dog/, '🌭']]; for (const [re, e] of m) if (re.test(t)) return e; return '🍽️'; }
// Optional: ask Claude to map an unusual sentence to one of the known intents.
async function aiInterpret(env, cfg, text, snapshot) {
  const body = { model: cfg.voice.aiModel || 'claude-haiku-5-5', max_tokens: 300,
    system: `You turn one spoken sentence from a family kitchen board into JSON. Kids: ${cfg.kids.map((k) => k.name).join(', ')}. Today ${snapshot.today}. Intents: grocery.add{items}, grocery.remove{item}, meal.set{date,text}, note.add{text}, todo.add{kid|null,title,date}, task.check{kid,phrase}, quest.claim{kid,phrase}, timer{seconds,label}, navigate{page}, weather{tomorrow}, next, when{q}, stars{kid}, unknown. Reply with only JSON: {"intent":..., "params":{...}, "say":"short friendly confirmation"}.`,
    messages: [{ role: 'user', content: text }] };
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
  if (!r.ok) return null; const j = await r.json(); const txt = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  try { const m = /\{[\s\S]*\}/.exec(txt); const out = JSON.parse(m[0]); if (out.intent === 'task.check' && out.params?.kid) { const k = cfg.kids.find((x) => x.name.toLowerCase() === String(out.params.kid).toLowerCase()); const snapKid = snapshot.kids.find((x) => x.id === k?.id); const { bestTask } = await import('./lib/voice.js'); const task = snapKid && bestTask(out.params.phrase || '', snapKid.today); out.params = { kid: k?.id, id: task?.id }; if (!task) out.say = 'I could not find that task.'; } return out; } catch { return null; }
}


// ---------- legacy family code (used only until the first parent account exists) ----------
async function sha(s2) { return A.sha256hex(s2); }
async function getGate(env) { let g = await getSetting(env, 'gate', null); if (!g) { const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000)); g = { code, hash: await sha('fb:' + code) }; await setSetting(env, 'gate', g); } return g; }
const cookieOf = A.cookieOf;
const formOf = async (req) => { const f = await req.formData().catch(() => null); const o = {}; if (f) for (const [k, v] of f.entries()) o[k] = String(v); return o; };
const redirect = (to, cookie) => new Response(null, { status: 303, headers: { location: to, ...(cookie ? { 'set-cookie': cookie } : {}) } });
const ipOf = (req) => req.headers.get('cf-connecting-ip') || 'local';

// ---------- sign-in routes (public) ----------
// A shared site (SITE_NAME set) never shows one family's name to someone who isn't signed in.
const siteName = (env, cfg) => env.SITE_NAME || cfg.family?.name || 'Family Board';
const signupCodes = (env) => String(env.SIGNUP_CODES || '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
const isOwner = (env, session) => !!session?.user_email && String(env.OWNER_EMAILS || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean).includes(String(session.user_email).toLowerCase());
const PRIVACY_UPDATED = 'November 18, 2026';
const validZone = (z) => { try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return !!z; } catch { return false; } };
const withCookies = (res, ...cookies) => { const h = new Headers(res.headers); for (const c of cookies) h.append('set-cookie', c); return new Response(res.body, { status: res.status, headers: h }); };

// A new family on a shared site: its own household, settings (setup wizard still to run) and first grown-up.
async function createFamily(env, { family, person, zone, email, pw }) {
  const hr = await env.DB.prepare('INSERT INTO households(name,created_at) VALUES(?,?)').bind(family, nowIso()).run(); const fenv = { ...env, HID: hr.meta.last_row_id };
  const cfg = structuredClone(defaults); cfg.family.name = family; if (validZone(zone)) cfg.zone = zone; cfg.setup = { done: false, fresh: true };
  cfg.family.parents[0] = { ...cfg.family.parents[0], name: person, match: [person] };
  await saveConfig(fenv, cfg);
  const u = await env.DB.prepare('INSERT INTO users(email,name,person_id,pw_hash,pw_salt,pw_iter,created_at,last_login,household_id) VALUES(?,?,?,?,?,?,?,?,?)').bind(email, person, cfg.family.parents[0].id, pw ? pw.hash : 'google', pw ? pw.salt : null, pw ? pw.iter : null, nowIso(), nowIso(), fenv.HID).run();
  let recovery = null; if (pw) { recovery = A.recoveryCode(); await setSetting(fenv, 'recovery', { hash: await A.sha256hex('rc:' + recovery), created_at: nowIso() }); }
  return { env: fenv, userId: u.meta.last_row_id, recovery };
}

async function authRoute(env, req, path, cfg, userCount, session) {
  const name = siteName(env, cfg); const google = A.googleOn(env); const origin = new URL(req.url).origin;
  if (path === '/auth/signin' && req.method === 'POST') {
    const f = await formOf(req); const email = (f.email || '').trim().toLowerCase(); const ip = ipOf(req);
    const wait = (await A.check(env, 'login:' + email, 5)) || (await A.check(env, 'loginip:' + ip, 30)); if (wait) return A.signInPage({ msg: `Too many tries. Wait ${wait} minute${wait === 1 ? '' : 's'} and try again.`, email, name, google });
    const u = await env.DB.prepare('SELECT * FROM users /* all-families */ WHERE email=?').bind(email).first();
    if (!u || !(await A.verifyPassword(f.password || '', u))) { await A.fail(env, 'login:' + email, 15 * 60); await A.fail(env, 'loginip:' + ip, 60 * 60); return A.signInPage({ msg: 'That email and password do not match.', email, name, google }); }
    await A.clearLimit(env, 'login:' + email); await env.DB.prepare('UPDATE users SET last_login=? WHERE id=? AND household_id=?').bind(nowIso(), u.id, u.household_id).run();
    const kind = f.display ? 'display' : 'parent'; const token = await A.createSession(env, { userId: u.id, householdId: u.household_id, kind, label: (kind === 'display' ? 'Kitchen display · ' : '') + A.deviceLabel(req) });
    return redirect('/', A.sessionCookie(token, kind));
  }
  if (path === '/auth/google') {
    if (!google) return A.simplePage('Google sign-in is not set up yet', 'Use your email and password for now.');
    const q = new URL(req.url).searchParams; const st = await A.googleStart(env, origin, { display: q.get('display') === '1', ticket: (q.get('ticket') || '').replace(/[^0-9a-f]/g, ''), signup: (q.get('signup') || '').replace(/[^0-9a-f]/g, '') });
    return new Response(null, { status: 302, headers: { location: st.url, 'set-cookie': st.cookie } });
  }
  if (path === '/auth/google/callback') {
    if (!google) return redirect('/');
    const g = await A.googleFinish(env, req, origin); const fail = (m) => new Response(A.signInPage({ msg: m, name, google }).body, { status: 401, headers: { 'content-type': 'text/html; charset=utf-8', 'set-cookie': A.clearGoogleCookie() } });
    if (g.error) return fail(g.error);
    let u = await env.DB.prepare('SELECT * FROM users /* all-families */ WHERE email=?').bind(g.email).first();
    if (g.signup) {
      const sid = await A.sha256hex(g.signup); const su = await env.DB.prepare('SELECT * FROM signups /* all-families: by secret ticket */ WHERE id=? AND expires_at > ?').bind(sid, nowIso()).first();
      if (!su) return fail('That sign-up took too long. Please start again.');
      if (u) return fail(`${g.email} already has a board. Sign in instead.`);
      const fam = await createFamily(env, { family: su.family, person: su.person, zone: su.zone, email: g.email }); await env.DB.prepare('DELETE FROM signups /* all-families */ WHERE id=?').bind(sid).run();
      const token = await A.createSession(fam.env, { userId: fam.userId, householdId: fam.env.HID, kind: 'parent', label: A.deviceLabel(req) });
      const h = new Headers({ location: '/' }); h.append('set-cookie', A.sessionCookie(token, 'parent')); h.append('set-cookie', A.clearGoogleCookie()); return new Response(null, { status: 303, headers: h });
    }
    if (g.ticket) {
      const t = await getSetting(env, 'setup_ticket', null); const ok = t && t.expires > Date.now() && A.sameString(await A.sha256hex(g.ticket), t.hash);
      if (!ok) return fail('That setup link expired. Start again from Parents → Sign-in and devices.');
      if (userCount) return fail('Sign-in is already on. Sign in normally.');
      const person = cfg.family.parents.find((p2) => p2.id === t.personId) || cfg.family.parents[0];
      await env.DB.prepare('INSERT OR IGNORE INTO households(id,name,created_at) VALUES(?,?,?)').bind(env.HID, cfg.family.name || 'Family', nowIso()).run();
      if (!u) { const r = await env.DB.prepare('INSERT INTO users(email,name,person_id,created_at,household_id) VALUES(?,?,?,?,?)').bind(g.email, person.name, person.id, nowIso(), env.HID).run(); u = { id: r.meta.last_row_id, household_id: env.HID }; }
      await env.DB.prepare("UPDATE users SET pw_hash = COALESCE(pw_hash, 'google'), last_login=? WHERE id=? AND household_id=?").bind(nowIso(), u.id, u.household_id).run(); await setSetting(env, 'setup_ticket', null);
    } else if (!u) return fail(`${g.email} isn't on this board yet. Ask the other parent to add it in Parents → Sign-in and devices.`);
    else await env.DB.prepare("UPDATE users SET pw_hash = COALESCE(pw_hash, 'google'), last_login=? WHERE id=? AND household_id=?").bind(nowIso(), u.id, u.household_id).run();
    const kind = g.display ? 'display' : 'parent'; const token = await A.createSession(env, { userId: u.id, householdId: u.household_id, kind, label: (kind === 'display' ? 'Kitchen display · ' : '') + A.deviceLabel(req) });
    const h = new Headers({ location: g.ticket ? '/?signin=on' : '/' }); h.append('set-cookie', A.sessionCookie(token, kind)); h.append('set-cookie', A.clearGoogleCookie()); return new Response(null, { status: 303, headers: h });
  }
  if (path === '/auth/recover' && req.method === 'POST') {
    const f = await formOf(req); const email = (f.email || '').trim().toLowerCase(); const ip = ipOf(req);
    const wait = (await A.check(env, 'recover:' + ip, 5)); if (wait) return A.signInPage({ msg: `Too many tries. Wait ${wait} minutes.`, name });
    const u = await env.DB.prepare('SELECT * FROM users /* all-families */ WHERE email=?').bind(email).first(); const rec = u ? await getSetting({ ...env, HID: u.household_id }, 'recovery', null) : null;
    const codeOk = rec && A.sameString(await A.sha256hex('rc:' + String(f.code || '').trim().toUpperCase()), rec.hash);
    if (!u || !codeOk) { await A.fail(env, 'recover:' + ip, 60 * 60); return A.signInPage({ msg: 'That email and recovery code do not match.', email, name }); }
    const bad = A.passwordProblem(f.password); if (bad) return A.signInPage({ msg: bad, email, name });
    const h = await A.hashPassword(f.password); await env.DB.prepare('UPDATE users SET pw_hash=?, pw_salt=?, pw_iter=? WHERE id=? AND household_id=?').bind(h.hash, h.salt, h.iter, u.id, u.household_id).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND household_id=?').bind(u.id, u.household_id).run(); await A.clearLimit(env, 'login:' + email);
    return A.signInPage({ ok: 'Password changed. Sign in with the new one.', email, name });
  }
  if (path === '/auth/invite') {
    const f = req.method === 'POST' ? await formOf(req) : { t: new URL(req.url).searchParams.get('t') || '' }; const t = (f.t || '').trim();
    const inv = /^[0-9a-f]{64}$/.test(t) ? await env.DB.prepare('SELECT i.*, u.name, u.email FROM invites i JOIN users u ON u.id = i.user_id AND u.household_id = i.household_id /* all-families: the secret link names its family */ WHERE i.id=?').bind(await A.sha256hex(t)).first() : null;
    if (!inv || inv.used_at || inv.expires_at < nowIso()) return A.simplePage('This link has expired', 'Ask the other parent to send a new one from Parents → Sign-in and devices.');
    if (req.method !== 'POST') return A.invitePage({ token: t, name: inv.name, email: inv.email });
    if (f.password !== f.password2) return A.invitePage({ token: t, name: inv.name, email: inv.email, msg: 'The two passwords are different.' });
    const bad = A.passwordProblem(f.password); if (bad) return A.invitePage({ token: t, name: inv.name, email: inv.email, msg: bad });
    const h = await A.hashPassword(f.password); await env.DB.prepare('UPDATE users SET pw_hash=?, pw_salt=?, pw_iter=?, last_login=? WHERE id=? AND household_id=?').bind(h.hash, h.salt, h.iter, nowIso(), inv.user_id, inv.household_id).run();
    await env.DB.prepare('UPDATE invites SET used_at=? WHERE id=? AND household_id=?').bind(nowIso(), inv.id, inv.household_id).run();
    const token = await A.createSession(env, { userId: inv.user_id, householdId: inv.household_id, kind: 'parent', label: A.deviceLabel(req) }); return redirect('/', A.sessionCookie(token, 'parent'));
  }
  // ----- a new family signs up (shared sites only; needs an invite code while in testing) -----
  if (path === '/auth/signup') {
    if (!signupCodes(env).length) return A.simplePage('Sign-up is closed', 'This board is not taking new families right now.');
    if (req.method !== 'POST') return O.signupPage({ site: name, google });
    const f = await formOf(req); const ip = ipOf(req); const again = (msg) => O.signupPage({ site: name, google, msg, v: { ...f, password: '' } });
    const wait = await A.check(env, 'signup:' + ip, 10); if (wait) return again(`Too many tries. Wait ${wait} minutes.`);
    const code = String(f.code || '').trim().toUpperCase(); if (!signupCodes(env).some((c) => A.sameString(c, code))) { await A.fail(env, 'signup:' + ip, 60 * 60); return again('That invite code is not right.'); }
    const family = String(f.family || '').trim().slice(0, 40), person = String(f.person || '').trim().slice(0, 30); if (!family || !person) return again('Add your family name and what the kids call you.');
    await A.fail(env, 'signup:' + ip, 60 * 60); // every sign-up counts toward the hourly limit, not only mistakes
    if (f.method === 'google') {
      if (!google) return again('Google sign-in is not set up here. Use an email and password.');
      const ticket = A.randomHex(32); await env.DB.prepare('INSERT INTO signups /* all-families */ (id,family,person,zone,created_at,expires_at) VALUES(?,?,?,?,?,?)').bind(await A.sha256hex(ticket), family, person, String(f.zone || '').slice(0, 60), nowIso(), new Date(Date.now() + 10 * 60 * 1000).toISOString()).run();
      return redirect('/auth/google?signup=' + ticket);
    }
    const email = String(f.email || '').trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return again('Enter a valid email.');
    const bad = A.passwordProblem(f.password); if (bad) return again(bad);
    if (await env.DB.prepare('SELECT id FROM users /* all-families: an email belongs to one family */ WHERE email=?').bind(email).first()) return again('That email already has a board. Sign in instead.');
    const fam = await createFamily(env, { family, person, zone: f.zone, email, pw: await A.hashPassword(f.password) });
    const token = await A.createSession(fam.env, { userId: fam.userId, householdId: fam.env.HID, kind: 'parent', label: A.deviceLabel(req) });
    return withCookies(O.welcomePage(fam.recovery), A.sessionCookie(token, 'parent'));
  }
  // ----- a kitchen screen joins a family with a short code -----
  if (path === '/auth/pair') {
    if (session) return redirect('/');
    const ip = ipOf(req); const old = cookieOf(req, 'fbp'); const now = nowIso();
    if (old && /^[0-9a-f]{64}$/.test(old)) { const row = await env.DB.prepare('SELECT * FROM pairings /* all-families: by secret */ WHERE id=? AND expires_at > ? AND household_id IS NULL').bind(await A.sha256hex(old), now).first(); if (row) return O.pairPage({ code: row.code, origin, site: name }); }
    const wait = await A.check(env, 'pairnew:' + ip, 20); if (wait) return A.simplePage('Too many codes', `Wait ${wait} minutes and try again.`); await A.fail(env, 'pairnew:' + ip, 60 * 60);
    await env.DB.prepare('DELETE FROM pairings /* all-families: tidy up */ WHERE expires_at < ?').bind(now).run();
    const secret = A.randomHex(32); let code = '';
    for (let i = 0; i < 5 && !code; i++) { const c = O.pairCode(); try { await env.DB.prepare('INSERT INTO pairings /* all-families: no family yet */ (id,code,created_at,expires_at) VALUES(?,?,?,?)').bind(await A.sha256hex(secret), c, now, new Date(Date.now() + 15 * 60 * 1000).toISOString()).run(); code = c; } catch {} }
    if (!code) return A.simplePage('Something went wrong', 'Please reload to get a new code.');
    return withCookies(O.pairPage({ code, origin, site: name }), `fbp=${secret}; Path=/auth/pair; Max-Age=900; HttpOnly; SameSite=Lax; Secure`);
  }
  if (path === '/auth/pair/status') {
    const s2 = cookieOf(req, 'fbp'); if (!s2 || !/^[0-9a-f]{64}$/.test(s2)) return json({ expired: true });
    const id = await A.sha256hex(s2); const row = await env.DB.prepare('SELECT * FROM pairings /* all-families: by secret */ WHERE id=? AND expires_at > ?').bind(id, nowIso()).first();
    if (!row) return json({ expired: true }); if (!row.household_id) return json({ waiting: true });
    await env.DB.prepare('DELETE FROM pairings /* all-families: by secret */ WHERE id=?').bind(id).run();
    const token = await A.createSession({ ...env, HID: row.household_id }, { userId: row.claimed_by, householdId: row.household_id, kind: 'display', label: 'Kitchen display · ' + A.deviceLabel(req) });
    return withCookies(json({ ok: true }), A.sessionCookie(token, 'display'), 'fbp=; Path=/auth/pair; Max-Age=0; HttpOnly; SameSite=Lax; Secure');
  }
  if (path === '/link') {
    if (!session) return redirect('/?next=link');
    if (session.kind !== 'parent') return A.simplePage('Use a grown-up\'s phone', 'Open this page on a phone that is signed in as a grown-up, not on the kitchen screen.');
    if (req.method !== 'POST') return O.linkPage({ family: cfg.family?.name });
    const f = await formOf(req); const key = 'link:' + session.id; const wait = await A.check(env, key, 10); if (wait) return O.linkPage({ family: cfg.family?.name, msg: `Too many tries. Wait ${wait} minutes.` });
    const code = O.cleanCode(f.code); const row = code.length === 6 ? await env.DB.prepare('SELECT * FROM pairings /* all-families: claimed below */ WHERE code=? AND expires_at > ? AND household_id IS NULL').bind(code, nowIso()).first() : null;
    if (!row) { await A.fail(env, key, 60 * 60); return O.linkPage({ family: cfg.family?.name, msg: "That code didn't match. Check the screen, or get a new code there." }); }
    await env.DB.prepare('UPDATE pairings SET household_id=?, claimed_by=? WHERE id=? AND household_id IS NULL').bind(env.HID, session.user_id, row.id).run();
    return O.linkPage({ ok: 'The kitchen screen will open the board in a few seconds.' });
  }
  // ----- privacy, a family's own data, and the owner's overview -----
  if (path === '/privacy') return AC.privacyPage({ site: name, contact: env.CONTACT_EMAIL || '', updated: PRIVACY_UPDATED });
  if (path === '/account' || path === '/account/export' || path === '/account/delete') {
    if (!session) return redirect('/');
    if (session.kind !== 'parent') return A.simplePage('Use a grown-up\'s phone', 'Open this page on a phone or computer signed in as a grown-up, not on the kitchen screen.');
    const family = cfg.family?.name || 'Our board';
    if (path === '/account') return AC.accountPage({ site: name, family, isOwner: isOwner(env, session) });
    if (path === '/account/export') {
      const out = { exported_at: nowIso(), site: name, family };
      for (const t of AC.FAMILY_TABLES) {
        if (['cache', 'invites', 'pairings'].includes(t)) continue;
        const rows = (await env.DB.prepare(`SELECT * FROM ${t} WHERE household_id=?`).bind(env.HID).all()).results;
        out[t] = t === 'users' ? rows.map((u) => ({ email: u.email, name: u.name, person: u.person_id, created_at: u.created_at, last_login: u.last_login }))
          : t === 'sessions' ? rows.map((x) => ({ kind: x.kind, device: x.label, created_at: x.created_at, last_seen: x.last_seen }))
          : t === 'push_subs' ? rows.map((x) => ({ who: x.who, notifications: x.prefs, created_at: x.created_at }))
          : t === 'settings' ? rows.filter((x) => !AC.SECRET_SETTINGS.has(x.key)).map((x) => { let v; try { v = JSON.parse(x.value); } catch { v = x.value; } if (x.key === 'config' && v) delete v.pin; return { key: x.key, value: v }; })
          : rows.map(({ household_id, ...r }) => r);
      }
      return new Response(JSON.stringify(out, null, 1), { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="board-export-${nowIso().slice(0, 10)}.json"`, 'cache-control': 'no-store' } });
    }
    if (req.method !== 'POST') return redirect('/account');
    const f = await formOf(req);
    if (String(f.name || '').trim() !== family.trim()) return AC.accountPage({ site: name, family, isOwner: isOwner(env, session), msg: "The name didn't match, so nothing was deleted." });
    for (const t of AC.FAMILY_TABLES) await env.DB.prepare(`DELETE FROM ${t} WHERE household_id=?`).bind(env.HID).run();
    await env.DB.prepare('DELETE FROM households WHERE id=?').bind(env.HID).run();
    return withCookies(AC.deletedPage(name), A.clearCookie());
  }
  if (path === '/owner') {
    if (!isOwner(env, session)) return A.simplePage('Not available', 'This page is only for the person who runs the site.');
    const families = (await env.DB.prepare(`SELECT h.id, h.name, h.created_at,
      (SELECT COUNT(*) FROM users u WHERE u.household_id = h.id AND u.pw_hash IS NOT NULL) AS grownups,
      (SELECT COUNT(*) FROM sessions s WHERE s.household_id = h.id AND s.expires_at > ?) AS devices,
      (SELECT MAX(s.last_seen) FROM sessions s WHERE s.household_id = h.id) AS last_seen,
      (SELECT COUNT(*) FROM checks c WHERE c.household_id = h.id) AS checks,
      (SELECT COUNT(*) FROM photos p WHERE p.household_id = h.id) AS photos,
      (SELECT COALESCE(SUM(LENGTH(p.data)), 0) FROM photos p WHERE p.household_id = h.id) AS photo_bytes
      FROM households h /* all-families: the owner's overview counts each family, never its contents */ ORDER BY h.id`).bind(nowIso()).all()).results;
    const totals = families.reduce((t, x) => ({ grownups: t.grownups + x.grownups, devices: t.devices + x.devices, photo_bytes: t.photo_bytes + x.photo_bytes }), { grownups: 0, devices: 0, photo_bytes: 0 });
    const feedback = (await env.DB.prepare('SELECT household_id, text, created_at, issue_url FROM feedback /* all-families: feedback sent to the owner */ ORDER BY id DESC LIMIT 30').all()).results;
    return AC.ownerPage({ site: name, families, totals, feedback, signupOpen: signupCodes(env).length > 0 });
  }
  if (path === '/auth/signout') { const tok = cookieOf(req, 'fbs'); if (tok && /^[0-9a-f]{64}$/.test(tok)) await env.DB.prepare('DELETE FROM sessions /* all-families: by secret token */ WHERE id=?').bind(await A.sha256hex(tok)).run(); return redirect('/', A.clearCookie()); }
  return null;
}
async function newInvite(env, userId) { const token = A.randomHex(32); await env.DB.prepare('INSERT INTO invites(id,user_id,created_at,expires_at,household_id) VALUES(?,?,?,?,?)').bind(await A.sha256hex(token), userId, nowIso(), new Date(Date.now() + 7 * 86400000).toISOString(), env.HID).run(); return token; }

// ---------- push notifications ----------
const KINDS = ['quest', 'reward', 'done', 'feedback', 'morning', 'payday'];
async function vapidKeys(env) { let v = await getSetting(env, 'vapid', null); if (!v) { v = await makeVapid(); await setSetting(env, 'vapid', v); } return v; }
async function notify(env, kind, title, body, url = '/', onlyWho = null) {
  try {
    // Direct sends from the kitchen go to every phone that turned notifications on (or just the chosen person's); other kinds follow each phone's choices.
    const subs = (await env.DB.prepare('SELECT * FROM push_subs WHERE household_id=?').bind(env.HID).all()).results.filter((x) => { if (onlyWho) return (x.who || '').toLowerCase() === onlyWho.toLowerCase(); if (kind === 'send') return true; try { return JSON.parse(x.prefs || '[]').includes(kind); } catch { return false; } });
    if (!subs.length) return 0; const v = await vapidKeys(env); const subject = (await getSetting(env, 'origin', null)) || 'https://example.invalid';
    const work = Promise.all(subs.map(async (x) => { try { const r = await sendPush({ endpoint: x.endpoint, keys: { p256dh: x.p256dh, auth: x.auth } }, { title, body, url, tag: kind }, v, subject); if (r.gone) await env.DB.prepare('DELETE FROM push_subs WHERE id=? AND household_id=?').bind(x.id, env.HID).run(); else if (r.ok) await env.DB.prepare('UPDATE push_subs SET last_ok=? WHERE id=? AND household_id=?').bind(nowIso(), x.id, env.HID).run(); return r.ok; } catch { return false; } }));
    const res = await Promise.race([work, new Promise((r) => setTimeout(() => r([]), 4000))]); return res.filter(Boolean).length;
  } catch { return 0; }
}
// Pay day evening: tell the grown-ups what each kid earned this week.
async function payDayNotice(env, cfg, req) {
  const now = new Date(); const p = parts(now, cfg.zone); const today = ymd(now, cfg.zone); if (p.wd !== P.payDayOf(cfg)) return;
  const [h, m] = (cfg.week?.closesAt || '18:00').split(':').map(Number); const mins = p.h * 60 + p.mi - (h * 60 + m); if (mins < 0 || mins > 45) return;
  if ((await getSetting(env, 'payday', '')) === today) return; await setSetting(env, 'payday', today);
  const snap = await board(env, cfg, req, new URL('https://board.local/'));
  await notify(env, 'payday', '💰 Pay day!', snap.kids.map((k) => `${k.name} earned ${'$' + k.week.total.toFixed(2)}${k.week.prize?.earned ? ' and the weekly prize ' + (cfg.prize?.emoji || '') : ''}`).join(' · '), '/#today');
}
// What a new family has done so far, for the grown-ups' Getting started list.
async function startProgress(env, cfg) {
  const one = (sql, ...a) => env.DB.prepare(sql).bind(...a).first().then((r) => r?.n || 0).catch(() => 0);
  const [displays, accounts, pushes, checks, meals] = await Promise.all([
    one("SELECT COUNT(*) AS n FROM sessions WHERE kind='display' AND expires_at > ? AND household_id=?", nowIso(), env.HID), one('SELECT COUNT(*) AS n FROM users WHERE pw_hash IS NOT NULL AND household_id=?', env.HID),
    one('SELECT COUNT(*) AS n FROM push_subs WHERE household_id=?', env.HID), one('SELECT COUNT(*) AS n FROM checks WHERE household_id=?', env.HID), one('SELECT COUNT(*) AS n FROM meals WHERE household_id=?', env.HID)]);
  return { calendar: cfg.calendars.some((c) => c.url && c.url !== 'sample'), display: displays > 0, accounts, grownups: cfg.family.parents.length, pushes, checked: checks > 0, meal: meals > 0, kidsTurn: (cfg.setup?.kidsTurn || []).length };
}
async function morningBriefing(env, cfg, req) {
  const zone = cfg.zone; const now = new Date(); const p = parts(now, zone); const today = ymd(now, zone); const [h, m] = (cfg.notify?.morningAt || '06:45').split(':').map(Number);
  const mins = p.h * 60 + p.mi - (h * 60 + m); if (mins < 0 || mins > 30) return; if ((await getSetting(env, 'briefing', '')) === today) return; await setSetting(env, 'briefing', today);
  const evs = (await getEvents(env, cfg, req).catch(() => ({ events: [] }))).events.filter((e) => e.date === today);
  const wx = await cached(env, wxKey(cfg), 60 * 60 * 1000, () => H.fetchWeather(cfg)).catch(() => null); const d = wx?.days?.find((x) => x.date === today);
  const meal = await env.DB.prepare('SELECT text FROM meals WHERE date=? AND household_id=?').bind(today, env.HID).first();
  const lines = [];
  if (d) lines.push(`${d.icon} ${d.high}°/${d.low}°, ${H.weatherTip(cfg, d, wx.current)}`);
  if (P.isSchoolDay(today, cfg)) { const go = cfg.kids.filter((k) => k.leaveTime).map((k) => `${k.name} leaves ${k.leaveTime}`).join(', '); if (go) lines.push(go); }
  lines.push(evs.length ? evs.slice(0, 5).map((e) => `${e.timeLabel} ${e.title}`).join(' · ') : 'Nothing on the calendar');
  if (meal) lines.push(`Dinner: ${meal.text}`);
  await notify(env, 'morning', 'Good morning ☀️', lines.join('\n'));
}

// ---------- router ----------
export default {
  // Every 15 minutes: refresh calendars and weather and send the timed notices, one family at a time.
  async scheduled(ev, env, ctx) {
    const ids = new Set([1]); for (const r of (await env.DB.prepare('SELECT id FROM households /* all-families: the job visits each one */ ORDER BY id').all().catch(() => ({ results: [] }))).results) ids.add(r.id);
    const req = new Request('https://family-board.local/');
    // Once a day, drop saved voice clips nobody has played in 90 days.
    const nowD = new Date(); if (nowD.getUTCHours() === 9 && nowD.getUTCMinutes() < 15) ctx.waitUntil(env.DB.prepare('DELETE FROM tts_cache /* all-families: shared voice clips */ WHERE used_at < ?').bind(new Date(Date.now() - 90 * 86400000).toISOString()).run().catch(() => {}));
    ctx.waitUntil((async () => { for (const id of ids) { const fenv = { ...env, HID: id }; try { const cfg = await getConfig(fenv); await Promise.all([getEvents(fenv, cfg, req, true), cached(fenv, wxKey(cfg), 0, () => H.fetchWeather(cfg), true), morningBriefing(fenv, cfg, req), payDayNotice(fenv, cfg, req).catch(() => {})]); } catch {} } })());
  },
  async fetch(req, env, ctx) {
    const url = new URL(req.url); const path = url.pathname;
    const userCount = (await env.DB.prepare('SELECT COUNT(*) AS n FROM users /* all-families: is sign-in on for this site */ WHERE pw_hash IS NOT NULL').first().catch(() => ({ n: 0 })))?.n || 0;
    const session = userCount ? await A.readSession(env, req) : null;
    // From here on every lookup is for one family: the signed-in device's, or family 1 before sign-in exists.
    env = { ...env, HID: session?.household_id || 1 };
    if (path.startsWith('/auth/') || ['/link', '/privacy', '/account', '/account/export', '/account/delete', '/owner'].includes(path)) { const r = await authRoute(env, req, path, await getConfig(env), userCount, session); if (r) return r; }
    if (path === '/api/login' && req.method === 'POST') {
      if (userCount) return redirect('/');
      const f = await formOf(req); const code = (f.code || '').trim(); const ip = ipOf(req); const wait = await A.check(env, 'code:' + ip, 10); if (wait) return A.legacyCodePage(`Too many tries. Wait ${wait} minutes.`, !!env.SETUP_CODE);
      const g = await getGate(env);
      if (code && (A.sameString(await sha('fb:' + code), g.hash) || (env.SETUP_CODE && A.sameString(code, String(env.SETUP_CODE).trim())))) { await A.clearLimit(env, 'code:' + ip); return redirect('/', `fb=${g.hash}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax; Secure`); }
      await A.fail(env, 'code:' + ip, 60 * 60); return A.legacyCodePage('That code is not right.', !!env.SETUP_CODE);
    }
    const openPaths = ['/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/apple-touch-icon-precomposed.png', '/manifest.webmanifest', '/api/health'];
    // LOCAL_DEV is only ever set by `wrangler dev` (see .claude/launch.json): with custom-domain routes, dev requests carry the real domain as their host.
    const local = url.hostname.startsWith('localhost') || url.hostname === '127.0.0.1' || env.LOCAL_DEV === '1';
    if (!openPaths.includes(path)) {
      if (userCount) { if (!session) return path.startsWith('/api/') ? json({ error: 'sign in', needLogin: true }, 401) : A.signInPage({ name: siteName(env, await getConfig(env)), google: A.googleOn(env), signup: signupCodes(env).length > 0 }); }
      else if (!local) { const g = await getGate(env); if (cookieOf(req, 'fb') !== g.hash) return path.startsWith('/api/') ? json({ error: 'sign in', needLogin: true }, 401) : A.legacyCodePage('', !!env.SETUP_CODE); }
    }
    if (!path.startsWith('/api/')) { const r = await env.ASSETS.fetch(req); if (!/\.(js|css|html|webmanifest)$|^\/$/.test(path)) return r; const h = new Headers(r.headers); h.set('cache-control', 'no-cache'); return new Response(r.body, { status: r.status, headers: h }); }
    try {
      const cfg = await getConfig(env); const method = req.method; const body = method === 'GET' ? {} : await req.json().catch(() => ({}));
      const zone = cfg.zone; const today = ymd(new Date(), zone);
      ADMIN.set(req, await decideAdmin(env, req, body, cfg, session, userCount));
      const admin = () => pinOk(req);
      if (path === '/api/board') return json({ ...(await board(env, cfg, req, url)), start: (session?.kind === 'parent' || local) ? await startProgress(env, cfg) : null, me: session ? { kind: session.kind, name: session.user_name, personId: session.person_id } : null, auth: { enabled: !!userCount, local, google: A.googleOn(env) }, feedbackPublic: !cfg.feedbackUrl && !!env.FEEDBACK_REPO && !!env.GITHUB_TOKEN });
      if (path === '/api/health') return json({ ok: true, time: nowIso() });
      if (path === '/api/version') return json({ version: env.CF_VERSION_METADATA?.id || 'dev' });
      if (path === '/api/reward/request' && method === 'POST') {
        const r = (cfg.rewards || []).find((x) => x.id === body.rewardId); if (!r) return err('no such reward', 404); const k = cfg.kids.find((x) => x.id === body.kid); if (!k) return err('kid', 404);
        const b = await board(env, cfg, req, url); const kk = b.kids.find((x) => x.id === k.id); const pend = kk.rewardRequests.filter((x) => x.status === 'pending').reduce((s2, x) => s2 + x.cost, 0);
        if (kk.wardrobe.balance - pend < r.cost) return err(`Need ${r.cost - (kk.wardrobe.balance - pend)} more stars`, 403);
        await env.DB.prepare('INSERT INTO reward_requests(kid,reward,title,emoji,cost,requested_at,household_id) VALUES(?,?,?,?,?,?,?)').bind(k.id, r.id, r.title, r.emoji || '🎁', r.cost, nowIso(), env.HID).run();
        await log(env, 'reward', k.id, `${k.name} asked for ${r.title}`); await notify(env, 'reward', `${k.name} wants a reward ${r.emoji || '🎁'}`, `${r.title} · ★ ${r.cost}. Tap to approve.`); return json({ ok: true });
      }
      if (path === '/api/reward/decide' && method === 'POST') {
        if (!admin()) return denyAdmin(req); const rq = await env.DB.prepare('SELECT * FROM reward_requests WHERE id=? AND household_id=?').bind(body.id, env.HID).first(); if (!rq || rq.status !== 'pending') return err('not pending', 409);
        if (body.approve) { const b = await board(env, cfg, req, url); const kk = b.kids.find((x) => x.id === rq.kid); if (!kk || kk.wardrobe.balance < rq.cost) return err('Not enough stars any more', 409);
          await env.DB.prepare('INSERT INTO ledger(week,kid,kind,amount,stars,note,created_at,household_id) VALUES(?,?,?,?,?,?,?,?)').bind(b.weekStart, rq.kid, 'reward', 0, rq.cost, rq.title, nowIso(), env.HID).run(); }
        await env.DB.prepare('UPDATE reward_requests SET status=?, decided_at=? WHERE id=? AND household_id=?').bind(body.approve ? 'approved' : 'denied', nowIso(), rq.id, env.HID).run(); return json({ ok: true });
      }
      if (path.startsWith('/api/photo/') && method === 'GET') {
        const ph = await env.DB.prepare('SELECT data, mime FROM photos WHERE id=? AND household_id=?').bind(+path.split('/')[3], env.HID).first(); if (!ph) return err('no photo', 404);
        const bin = Uint8Array.from(atob(ph.data), (c) => c.charCodeAt(0)); return new Response(bin, { headers: { 'content-type': ph.mime, 'cache-control': 'private, max-age=31536000, immutable' } });
      }
      if (path === '/api/photo' && method === 'POST') {
        if (!admin()) return denyAdmin(req); const data = String(body.data || '').replace(/^data:[^,]+,/, ''); if (!data || data.length > 1400000) return err('photo too large');
        const r = await env.DB.prepare('INSERT INTO photos(data,mime,w,h,added_by,created_at,household_id) VALUES(?,?,?,?,?,?,?)').bind(data, body.mime || 'image/jpeg', body.w || null, body.h || null, body.by || null, nowIso(), env.HID).run(); return json({ ok: true, id: r.meta.last_row_id });
      }
      if (path.startsWith('/api/photo/') && method === 'DELETE') { if (!admin()) return denyAdmin(req); await env.DB.prepare('DELETE FROM photos WHERE id=? AND household_id=?').bind(+path.split('/')[3], env.HID).run(); return json({ ok: true }); }
      if (path === '/api/push/key') return json({ publicKey: (await vapidKeys(env)).publicKey });
      // The kitchen screen sends the grocery list, today's plan or a note to the grown-ups' phones.
      if (path === '/api/push/send' && method === 'POST') {
        const wait = await A.check(env, 'send:' + env.HID, 20); if (wait) return err(`That's a lot of sending. Try again in ${wait} minutes.`, 429); await A.fail(env, 'send:' + env.HID, 10 * 60);
        const what = body.what; let title = '', text = '', link = '/#today';
        if (what === 'groceries') { const g = (await env.DB.prepare('SELECT text FROM groceries WHERE done = 0 AND household_id=? ORDER BY id').bind(env.HID).all()).results; if (!g.length) return err('The grocery list is empty'); title = `🛒 Grocery list (${g.length})`; text = g.map((x) => x.text).join(', '); link = '/#groceries'; }
        else if (what === 'today') { const snap = await board(env, cfg, req, url); const evs = snap.events.filter((e) => e.date <= today && e.endDate >= today); const meal = snap.meals.find((m) => m.date === today);
          title = `📅 Today, ${evs.length} event${evs.length === 1 ? '' : 's'}`; text = [evs.slice(0, 6).map((e) => `${e.allDay ? '' : e.timeLabel + ' '}${e.title}${e.place ? ' (leave ' + e.place.leaveBy + ')' : ''}`).join(' · ') || 'Nothing on the calendar', meal ? `Dinner: ${meal.text}` : '', snap.kids.map((k) => `${k.name} ${k.today.filter((t) => t.done && !t.doneByOther).length}/${k.today.filter((t) => !t.doneByOther).length}`).join(', ')].filter(Boolean).join('\n'); }
        else if (what === 'note') { text = String(body.text || '').trim().slice(0, 300); if (!text) return err('Write a note first'); title = `💬 From the kitchen${body.from ? ', ' + String(body.from).slice(0, 30) : ''}`; }
        else return err('Nothing to send');
        const n = await notify(env, 'send', title, text, link, body.to && body.to !== 'all' ? String(body.to) : null);
        if (!n) return err("No phones are set up yet. On each phone, open the board and tap Turn on notifications.", 404);
        return json({ ok: true, sent: n });
      }
      if (path === '/api/push/subscribe' && method === 'POST') {
        if (!admin()) return denyAdmin(req); const sub = body.sub; if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return err('bad subscription');
        const prefs = JSON.stringify((body.prefs || KINDS).filter((k) => KINDS.includes(k))); await setSetting(env, 'origin', url.origin);
        await env.DB.prepare('INSERT INTO push_subs(endpoint,p256dh,auth,who,prefs,created_at,household_id) VALUES(?,?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth, who=excluded.who, prefs=excluded.prefs, household_id=excluded.household_id').bind(sub.endpoint, sub.keys.p256dh, sub.keys.auth, body.who || null, prefs, nowIso(), env.HID).run();
        return json({ ok: true });
      }
      if (path === '/api/push/unsubscribe' && method === 'POST') { await env.DB.prepare('DELETE FROM push_subs WHERE endpoint=? AND household_id=?').bind(body.endpoint || '', env.HID).run(); return json({ ok: true }); }
      if (path === '/api/push/status' && method === 'POST') { const x = await env.DB.prepare('SELECT who, prefs, last_ok FROM push_subs WHERE endpoint=? AND household_id=?').bind(body.endpoint || '', env.HID).first(); return json(x ? { ...x, prefs: JSON.parse(x.prefs) } : null); }
      if (path === '/api/push/test' && method === 'POST') { if (!admin()) return denyAdmin(req); const all = (await env.DB.prepare('SELECT * FROM push_subs WHERE endpoint=? AND household_id=?').bind(body.endpoint || '', env.HID).all()).results; if (!all.length) return err('This device is not signed up yet', 404); const v = await vapidKeys(env); const x = all[0]; const r = await sendPush({ endpoint: x.endpoint, keys: { p256dh: x.p256dh, auth: x.auth } }, { title: cfg.family?.name || 'Family Board', body: `${cfg.family?.dog ? cfg.family.dog + ' says hi! ' : ''}Notifications work for ${x.who || 'you'}.`, url: '/' }, v, url.origin); return r.ok ? json({ ok: true }) : err('Push service said ' + r.status, 502); }
      if (path === '/api/tts') {
        const text = (url.searchParams.get('t') || '').slice(0, 400).trim(); const voice = (url.searchParams.get('v') || cfg.voice.cloudVoice || 'thalia').replace(/[^a-z]/g, '');
        if (!text || !env.AI) return err('no voice', 404);
        // Each clip is made once and saved in the database (Cloudflare's cache does nothing on workers.dev addresses),
        // because the AI voice has a daily free limit.
        const audioRes = (buf) => new Response(buf, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=2592000' } });
        const saved = await env.DB.prepare('SELECT audio FROM tts_cache /* all-families: shared voice clips */ WHERE voice=? AND text=?').bind(voice, text).first().catch(() => null);
        if (saved?.audio) { ctx.waitUntil(env.DB.prepare('UPDATE tts_cache /* all-families: shared voice clips */ SET used_at=? WHERE voice=? AND text=?').bind(nowIso(), voice, text).run().catch(() => {})); return audioRes(new Uint8Array(saved.audio)); }
        try {
          const out = await env.AI.run('@cf/deepgram/aura-2-en', { text, speaker: voice, encoding: 'mp3' });
          const buf = new Uint8Array(out instanceof ReadableStream ? await new Response(out).arrayBuffer() : out?.audio ? Uint8Array.from(atob(out.audio), (c) => c.charCodeAt(0)) : out);
          ctx.waitUntil(env.DB.prepare('INSERT OR REPLACE INTO tts_cache /* all-families: shared voice clips */ (voice,text,audio,created_at,used_at) VALUES(?,?,?,?,?)').bind(voice, text, buf, nowIso(), nowIso()).run().catch(() => {}));
          return audioRes(buf);
        } catch (e) { const m = String(e.message || e); return json({ error: 'voice unavailable: ' + m, limit: /4006|daily free allocation/i.test(m) }, 503); }
      }
      if (path === '/api/units' && method === 'POST') { cfg.weather.units = body.units === 'celsius' ? 'celsius' : 'fahrenheit'; await saveConfig(env, cfg); return json({ ok: true, units: cfg.weather.units }); }
      if (path === '/api/feedback' && method === 'POST') {
        const text = String(body.text || '').trim(); if (!text) return err('say something first');
        const wait = await A.check(env, 'fb:' + env.HID, 20); if (wait) return err(`That's a lot of feedback for one day. Try again in ${wait} minutes.`, 429); await A.fail(env, 'fb:' + env.HID, 24 * 60 * 60);
        // A family that linked its own repo gets issues there, word for word. Otherwise feedback goes to the
        // site's public repo (FEEDBACK_REPO) with the board's names removed and no family named.
        let issueUrl = null; const own = /github\.com\/([^/]+)\/([^/#?]+)/.exec(cfg.feedbackUrl || ''); const pub = !own && /^[\w.-]+\/[\w.-]+$/.test(env.FEEDBACK_REPO || '');
        const repo = own ? `${own[1]}/${own[2].replace(/\.git$/, '')}` : pub ? env.FEEDBACK_REPO : null;
        const shown = pub ? AC.redact(text, cfg) : text; const from = pub ? `a family on ${env.SITE_NAME || 'a family board'}` : (body.from || 'the board');
        if (repo && env.GITHUB_TOKEN) { try { const r = await fetch(`https://api.github.com/repos/${repo}/issues`, { method: 'POST', headers: { authorization: 'Bearer ' + env.GITHUB_TOKEN, 'content-type': 'application/json', 'user-agent': 'family-board', accept: 'application/vnd.github+json' }, body: JSON.stringify({ title: shown.slice(0, 70) + (shown.length > 70 ? '…' : ''), body: `${shown}\n\n_From ${from}${body.page ? ` on page "${String(body.page).slice(0, 40)}"` : ''}_`, labels: ['from feedback'] }) }); if (r.ok) issueUrl = (await r.json()).html_url; } catch {} }
        await env.DB.prepare('INSERT INTO feedback(text,from_who,page,created_at,issue_url,household_id) VALUES(?,?,?,?,?,?)').bind(text, body.from || null, body.page || null, nowIso(), issueUrl, env.HID).run();
        await log(env, 'feedback', null, `${body.from || 'Someone'}: ${text.slice(0, 80)}`); await notify(env, 'feedback', `Feedback from ${body.from || 'someone'}`, text.slice(0, 160)); return json({ ok: true, issueUrl });
      }
      if (path === '/api/feedback' && method === 'GET') return json((await env.DB.prepare('SELECT * FROM feedback WHERE household_id=? ORDER BY id DESC LIMIT 100').bind(env.HID).all()).results);
      if (path.startsWith('/api/feedback/') && method === 'POST') { const id = +path.split('/')[3]; await env.DB.prepare('UPDATE feedback SET status=? WHERE id=? AND household_id=?').bind(body.status || 'done', id, env.HID).run(); return json({ ok: true }); }
      if (path === '/api/check' && method === 'POST') return doCheck(env, cfg, body, req);
      if (path === '/api/todo' && method === 'POST') { if (!body.title) return err('title required'); await env.DB.prepare('INSERT INTO todos(date,kid,title,stars,created_at,household_id) VALUES(?,?,?,?,?,?)').bind(body.date || today, body.kid || null, body.title, P.num(body.stars, 1), nowIso(), env.HID).run(); return json({ ok: true }); }
      if (path.startsWith('/api/todo/') && method === 'DELETE') { if (!admin()) return denyAdmin(req); await env.DB.prepare('DELETE FROM todos WHERE id=? AND household_id=?').bind(+path.split('/')[3], env.HID).run(); return json({ ok: true }); }
      if (path === '/api/quest/claim' && method === 'POST') return claimQuest(env, cfg, body.kid, body.questId, body.title, body.stars, today);
      if (path === '/api/quiz/finish' && method === 'POST') return finishQuiz(env, cfg, body, today);
      if (path === '/api/quest/decide' && method === 'POST') { if (!admin()) return denyAdmin(req); await env.DB.prepare('UPDATE quest_claims SET status=?, decided_at=? WHERE id=? AND household_id=?').bind(body.approve ? 'approved' : 'denied', nowIso(), body.id, env.HID).run(); return json({ ok: true }); }
      if (path === '/api/kids-done' && method === 'POST') { const turn = cfg.setup?.kidsTurn; if (Array.isArray(turn) && turn.includes(body.kid)) { cfg.setup.kidsTurn = turn.filter((x) => x !== body.kid); await saveConfig(env, cfg); } return json({ ok: true }); }
      if (path === '/api/wardrobe/look' && method === 'POST') { const ward = await getSetting(env, 'wardrobe:' + body.kid, { owned: [], look: {} }); ward.look = body.look || {}; await setSetting(env, 'wardrobe:' + body.kid, ward); return json({ ok: true }); }
      if (path === '/api/wardrobe/buy' && method === 'POST') {
        const item = cfg.wardrobe.catalog.find((i) => i.id === body.itemId); if (!item) return err('no item', 404); const ward = await getSetting(env, 'wardrobe:' + body.kid, { owned: [], look: {} });
        if (ward.owned.includes(item.id)) return json({ ok: true, already: true }); if (item.prizeOnly) return err('prize only', 403);
        const b = await board(env, cfg, req, url); const k = b.kids.find((x) => x.id === body.kid); if (!k) return err('kid', 404);
        if (item.minLevel && k.level.level < item.minLevel) return err(`Level ${item.minLevel} needed`, 403); if (k.wardrobe.balance < item.cost) return err('Not enough stars yet', 403);
        if (item.cost > 0) await env.DB.prepare('INSERT INTO ledger(week,kid,kind,amount,stars,note,created_at,household_id) VALUES(?,?,?,?,?,?,?,?)').bind(b.weekStart, body.kid, 'wardrobe', 0, item.cost, item.label, nowIso(), env.HID).run();
        ward.owned.push(item.id); await setSetting(env, 'wardrobe:' + body.kid, ward); return json({ ok: true });
      }
      if (path === '/api/goal' && method === 'POST') { await setSetting(env, 'goal:' + body.kid, body.goal || null); return json({ ok: true }); }
      if (path === '/api/grocery' && method === 'POST') { const ids = await addGroceries(env, body.text, body.by); return json({ ok: true, ids }); }
      if (path.startsWith('/api/grocery/') && method === 'POST') {
        const [, , , id, act] = path.split('/'); if (id === 'clear') { await env.DB.prepare('DELETE FROM groceries WHERE done=1 AND household_id=?').bind(env.HID).run(); return json({ ok: true }); }
        if (act === 'toggle') { await env.DB.prepare('UPDATE groceries SET done=1-done, done_at=? WHERE id=? AND household_id=?').bind(nowIso(), +id, env.HID).run(); return json({ ok: true }); }
        if (act === 'aisle') { await env.DB.prepare('UPDATE groceries SET aisle=? WHERE id=? AND household_id=?').bind(body.aisle, +id, env.HID).run(); return json({ ok: true }); }
      }
      if (path.startsWith('/api/grocery/') && method === 'DELETE') { await env.DB.prepare('DELETE FROM groceries WHERE id=? AND household_id=?').bind(+path.split('/')[3], env.HID).run(); return json({ ok: true }); }
      if (path === '/api/meal' && method === 'PUT') { if (!body.text) { await env.DB.prepare('DELETE FROM meals WHERE date=? AND household_id=?').bind(body.date, env.HID).run(); return json({ ok: true }); } await env.DB.prepare('INSERT INTO meals(date,text,who,emoji,ingredients,household_id) VALUES(?,?,?,?,?,?) ON CONFLICT(household_id,date) DO UPDATE SET text=excluded.text, who=excluded.who, emoji=excluded.emoji, ingredients=excluded.ingredients').bind(body.date, body.text, body.who || null, body.emoji || mealEmoji(body.text), body.ingredients || null, env.HID).run(); return json({ ok: true }); }
      if (path === '/api/meal/shop' && method === 'POST') { const m = await env.DB.prepare('SELECT * FROM meals WHERE date=? AND household_id=?').bind(body.date, env.HID).first(); if (!m?.ingredients) return err('no ingredients'); await addGroceries(env, m.ingredients, 'dinner'); return json({ ok: true }); }
      if (path === '/api/note' && method === 'POST') { await env.DB.prepare('INSERT INTO notes(text,from_who,created_at,expires_at,household_id) VALUES(?,?,?,?,?)').bind(body.text, body.from || null, nowIso(), body.days ? new Date(Date.now() + body.days * 86400000).toISOString() : null, env.HID).run(); return json({ ok: true }); }
      if (path.startsWith('/api/note/') && method === 'DELETE') { await env.DB.prepare('DELETE FROM notes WHERE id=? AND household_id=?').bind(+path.split('/')[3], env.HID).run(); return json({ ok: true }); }
      if (path === '/api/voice' && method === 'POST') {
        const snap = await board(env, cfg, req, url); const dayLabel = (d) => d === snap.today ? 'today' : d === addDaysYmd(snap.today, 1) ? 'tomorrow' : new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
        const ctxv = { cfg, today: snap.today, weather: snap.weather, tip: snap.tip, groceries: snap.groceries, meals: snap.meals, turnText: snap.turnText,
          events: snap.events.filter((e) => e.date >= snap.today).map((e) => ({ ...e, dayLabel: dayLabel(e.date), leaveBy: e.place?.leaveBy })),
          kids: snap.kids.map((k) => ({ id: k.id, name: k.name, todayTasks: k.today, stats: { weekStars: k.week.earned + k.week.bonusStars, lifetime: k.lifetime, level: k.level.level } })) };
        const res = interpret(body.text || '', ctxv); const out = await execVoice(env, cfg, res, body, req, snap); await log(env, 'voice', null, `"${body.text}" → ${out.intent}`); return json(out);
      }
      if (path.startsWith('/api/admin/')) {
        if (!admin()) return denyAdmin(req); const sub = path.slice('/api/admin/'.length);
        if (sub === 'config' && method === 'GET') return json(cfg);
        if (sub === 'account' && method === 'GET') {
          const users = (await env.DB.prepare("SELECT id, email, name, person_id, created_at, last_login, pw_hash IS NOT NULL AS active, (pw_hash IS NOT NULL AND pw_hash != 'google') AS has_password FROM users WHERE household_id=? ORDER BY id").bind(env.HID).all()).results;
          const sessions = (await env.DB.prepare('SELECT s.id, s.kind, s.label, s.created_at, s.last_seen, u.name AS user_name FROM sessions s LEFT JOIN users u ON u.id = s.user_id AND u.household_id = s.household_id WHERE s.expires_at > ? AND s.household_id=? ORDER BY s.last_seen DESC').bind(nowIso(), env.HID).all()).results.map((x) => ({ ...x, id: x.id.slice(0, 16), current: session?.id === x.id }));
          return json({ enabled: !!userCount, google: A.googleOn(env), users, sessions, me: session ? { kind: session.kind, userId: session.user_id } : null, hasRecovery: !!(await getSetting(env, 'recovery', null)) });
        }
        if (sub === 'setup' && method === 'POST') {
          if (userCount) return err('Sign-in is already on', 409); const email = String(body.email || '').trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err('Enter a valid email');
          const bad = A.passwordProblem(body.password); if (bad) return err(bad); const person = cfg.family.parents.find((p2) => p2.id === body.personId) || cfg.family.parents[0];
          const h = await A.hashPassword(body.password); await env.DB.prepare('INSERT OR IGNORE INTO households(id,name,created_at) VALUES(?,?,?)').bind(env.HID, cfg.family.name || 'Family', nowIso()).run();
          const r = await env.DB.prepare('INSERT INTO users(email,name,person_id,pw_hash,pw_salt,pw_iter,created_at,last_login,household_id) VALUES(?,?,?,?,?,?,?,?,?)').bind(email, person.name, person.id, h.hash, h.salt, h.iter, nowIso(), nowIso(), env.HID).run();
          const code = A.recoveryCode(); await setSetting(env, 'recovery', { hash: await A.sha256hex('rc:' + code), created_at: nowIso() });
          const kind = body.display ? 'display' : 'parent'; const token = await A.createSession(env, { userId: r.meta.last_row_id, householdId: env.HID, kind, label: (kind === 'display' ? 'Kitchen display · ' : '') + A.deviceLabel(req) });
          return new Response(JSON.stringify({ ok: true, recoveryCode: code }), { headers: { 'content-type': 'application/json', 'set-cookie': A.sessionCookie(token, kind) } });
        }
        if (sub === 'setup-google' && method === 'POST') {
          if (userCount) return err('Sign-in is already on', 409); if (!A.googleOn(env)) return err('Google sign-in is not set up yet');
          const ticket = A.randomHex(32); await setSetting(env, 'setup_ticket', { hash: await A.sha256hex(ticket), personId: body.personId, expires: Date.now() + 10 * 60 * 1000 });
          return json({ ok: true, url: `/auth/google?ticket=${ticket}${body.display ? '&display=1' : ''}` });
        }
        if (sub === 'invite' && method === 'POST') {
          if (!userCount) return err('Turn on sign-in first'); const email = String(body.email || '').trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err('Enter a valid email');
          const person = cfg.family.parents.find((p2) => p2.id === body.personId); let u = await env.DB.prepare('SELECT * FROM users /* all-families: an email belongs to one family */ WHERE email=?').bind(email).first();
          if (u && u.household_id !== env.HID) return err('That email is already used by another family board');
          if (!u) { const r = await env.DB.prepare('INSERT INTO users(email,name,person_id,created_at,household_id) VALUES(?,?,?,?,?)').bind(email, person?.name || body.name || email.split('@')[0], person?.id || null, nowIso(), env.HID).run(); u = { id: r.meta.last_row_id }; }
          const token = await newInvite(env, u.id); return json({ ok: true, link: `${url.origin}/auth/invite?t=${token}` });
        }
        if (sub === 'reset-user' && method === 'POST') { const u = await env.DB.prepare('SELECT id FROM users WHERE id=? AND household_id=?').bind(+body.userId, env.HID).first(); if (!u) return err('no such account', 404); await env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND household_id=?').bind(u.id, env.HID).run(); const token = await newInvite(env, u.id); return json({ ok: true, link: `${url.origin}/auth/invite?t=${token}` }); }
        if (sub === 'remove-user' && method === 'POST') { if (+body.userId === session?.user_id) return err('You cannot remove yourself'); const left = (await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE pw_hash IS NOT NULL AND id != ? AND household_id=?').bind(+body.userId, env.HID).first()).n; if (!left) return err('Keep at least one parent account'); await env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND household_id=?').bind(+body.userId, env.HID).run(); await env.DB.prepare('DELETE FROM users WHERE id=? AND household_id=?').bind(+body.userId, env.HID).run(); return json({ ok: true }); }
        if (sub === 'revoke' && method === 'POST') { await env.DB.prepare('DELETE FROM sessions WHERE substr(id,1,16)=? AND household_id=?').bind(String(body.id || ''), env.HID).run(); return json({ ok: true }); }
        if (sub === 'revoke-others' && method === 'POST') { await env.DB.prepare('DELETE FROM sessions WHERE id != ? AND household_id=?').bind(session?.id || '', env.HID).run(); return json({ ok: true }); }
        if (sub === 'device-kind' && method === 'POST') { if (!session) return err('not signed in'); const kind = body.kind === 'display' ? 'display' : 'parent'; await env.DB.prepare('UPDATE sessions SET kind=?, label=? WHERE id=? AND household_id=?').bind(kind, (kind === 'display' ? 'Kitchen display · ' : '') + A.deviceLabel(req), session.id, env.HID).run(); return json({ ok: true }); }
        if (sub === 'password' && method === 'POST') { if (!session?.user_id) return err('Sign in on this device first'); const u = await env.DB.prepare('SELECT * FROM users WHERE id=? AND household_id=?').bind(session.user_id, env.HID).first(); if (!(await A.verifyPassword(String(body.old || ''), u))) return err('Your current password is not right'); const bad = A.passwordProblem(body.password); if (bad) return err(bad); const h = await A.hashPassword(body.password); await env.DB.prepare('UPDATE users SET pw_hash=?, pw_salt=?, pw_iter=? WHERE id=? AND household_id=?').bind(h.hash, h.salt, h.iter, u.id, env.HID).run(); await env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND id != ? AND household_id=?').bind(u.id, session.id, env.HID).run(); return json({ ok: true }); }
        if (sub === 'recovery' && method === 'POST') { const code = A.recoveryCode(); await setSetting(env, 'recovery', { hash: await A.sha256hex('rc:' + code), created_at: nowIso() }); return json({ ok: true, recoveryCode: code }); }
        if (sub === 'gate' && method === 'GET') return json(await getGate(env));
        if (sub === 'gate' && method === 'POST') { const code = String(body.code || '').trim(); if (!/^\d{4,8}$/.test(code)) return err('4 to 8 digits'); await setSetting(env, 'gate', { code, hash: await sha('fb:' + code) }); return json({ ok: true }); }
        if (sub === 'config' && method === 'PUT') { const next = { ...cfg, ...body.config, pin: body.config?.pin || cfg.pin }; await saveConfig(env, next); return json({ ok: true }); }
        if (sub === 'refresh') { const r = await getEvents(env, cfg, req, true); await cached(env, wxKey(cfg), 0, () => H.fetchWeather(cfg), true).catch(() => {}); return json({ ok: true, status: r.status }); }
        if (sub === 'payout') { await env.DB.prepare('INSERT INTO ledger(week,kid,kind,amount,stars,note,created_at,household_id) VALUES(?,?,?,?,?,?,?,?)').bind(body.week, body.kid, 'payout', P.num(body.amount, 0), 0, body.note || null, nowIso(), env.HID).run(); if (body.jar) await env.DB.prepare('INSERT INTO ledger(week,kid,kind,amount,stars,note,created_at,household_id) VALUES(?,?,?,?,?,?,?,?)').bind(body.week, body.kid, 'jar', P.num(body.jar, 0), 0, 'to savings jar', nowIso(), env.HID).run(); return json({ ok: true }); }
        if (sub === 'grant') { await env.DB.prepare('INSERT INTO ledger(week,kid,kind,amount,stars,note,created_at,household_id) VALUES(?,?,?,?,?,?,?,?)').bind(today, body.kid, 'grant', 0, P.num(body.stars, 0), body.note || null, nowIso(), env.HID).run(); if (body.itemId) { const w = await getSetting(env, 'wardrobe:' + body.kid, { owned: [], look: {} }); if (!w.owned.includes(body.itemId)) w.owned.push(body.itemId); await setSetting(env, 'wardrobe:' + body.kid, w); } return json({ ok: true }); }
        if (sub === 'history') { const l = await env.DB.prepare('SELECT * FROM ledger WHERE household_id=? ORDER BY created_at DESC LIMIT 200').bind(env.HID).all(); const c = await env.DB.prepare("SELECT date, kid, SUM(points) AS stars, COUNT(*) AS n FROM checks WHERE date>=? AND household_id=? GROUP BY date, kid ORDER BY date DESC").bind(addDaysYmd(today, -84), env.HID).all(); return json({ ledger: l.results, days: c.results }); }
        if (sub === 'log') return json((await env.DB.prepare('SELECT * FROM events_log WHERE household_id=? ORDER BY id DESC LIMIT 200').bind(env.HID).all()).results);
        if (sub === 'uncheck') { await env.DB.prepare('DELETE FROM checks WHERE date=? AND task=? AND household_id=?').bind(body.date, body.id, env.HID).run(); return json({ ok: true }); }
        if (sub === 'test-calendar') { try { const text = await loadIcs(env, body.url, req); const evs = parseICS(text, zone); const now = new Date(); const later = new Date(now.getTime() + 60 * 86400000);
          // The next real event, so the grown-up sees their own plans come through.
          const up = expandEvents(evs, now, later, zone, {}).filter((e) => new Date(e.start) >= now).sort((a, b2) => a.start.localeCompare(b2.start))[0];
          const when = up ? new Date(up.start).toLocaleString('en-US', { timeZone: zone, weekday: 'long', ...(up.allDay ? {} : { hour: 'numeric', minute: '2-digit' }) }) : '';
          return json({ ok: true, events: evs.length, next: up ? { title: String(up.title || 'Event').slice(0, 60), when } : null }); } catch (e) { return err(e.message.startsWith('calendar ') ? 'That link didn’t work. Check you copied all of it.' : e.message); } }
      }
      return err('not found', 404);
    } catch (e) { return err(e.message || String(e), 500); }
  },
};
