import defaults from './config.default.js';
import { parseICS, expandEvents, ymd, addDaysYmd, parts, zoned } from './lib/ical.js';
import * as P from './lib/points.js';
import * as H from './lib/helpers.js';
import { interpret } from './lib/voice.js';
import { makeVapid, sendPush } from './lib/push.js';
import * as A from './lib/auth.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const err = (msg, status = 400, extra = {}) => json({ error: msg, ...extra }, status);
const nowIso = () => new Date().toISOString();
const uid = () => Math.random().toString(36).slice(2, 10);

// ---------- config ----------
// Weather is cached per place and units, so moving the board's home town shows the new forecast at once.
const wxKey = (cfg) => `weather:${cfg.weather.units || 'fahrenheit'}:${cfg.weather.lat},${cfg.weather.lon}`;
async function getConfig(env) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind('config').first();
  if (!row) { await saveConfig(env, defaults); return structuredClone(defaults); }
  const c = JSON.parse(row.value);
  // Boards saved before first-run setup existed were set up by hand, so they never see the wizard.
  if (c.setup === undefined) c.setup = { done: true };
  for (const k of Object.keys(defaults)) if (c[k] === undefined) c[k] = structuredClone(defaults[k]);
  // One-time upgrades for boards saved before a setting existed.
  if (!c.family.groupWords) { c.family.groupWords = [...defaults.family.groupWords]; await saveConfig(env, c); }
  return c;
}
async function saveConfig(env, cfg) { await env.DB.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at').bind('config', JSON.stringify(cfg), nowIso()).run(); }
function publicConfig(cfg) {
  const c = structuredClone(cfg); delete c.pin;
  c.calendars = c.calendars.map((x) => ({ ...x, url: undefined, hasUrl: !!x.url }));
  return c;
}
async function getSetting(env, key, dflt) { const r = await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(key).first(); return r ? JSON.parse(r.value) : dflt; }
async function setSetting(env, key, val) { await env.DB.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at').bind(key, JSON.stringify(val), nowIso()).run(); }
// Admin (Parents) access is decided once per request: a parent's own signed-in device, or the right PIN (guesses limited).
const ADMIN = new WeakMap();
const pinOk = (req) => ADMIN.get(req)?.ok === true;
function denyAdmin(req) { const a = ADMIN.get(req); return a?.lockedMin ? json({ error: `Too many wrong PINs. Try again in ${a.lockedMin} minute${a.lockedMin === 1 ? '' : 's'}.`, needPin: true, locked: true }, 429) : json({ error: 'PIN', needPin: true }, 403); }
async function decideAdmin(env, req, body, cfg, session, userCount = 1) {
  if (session?.kind === 'parent') return { ok: true, via: 'account' };
  // A brand-new board, before anyone has signed up: whoever got past the setup code is setting it up.
  if (!userCount && cfg.setup?.done === false) return { ok: true, via: 'setup' };
  const given = req.headers.get('x-pin') || body?.pin; if (!given) return { ok: false };
  const key = 'pin:' + (session?.id || req.headers.get('cf-connecting-ip') || 'local'); const locked = await A.check(env, key, 5); if (locked) return { ok: false, lockedMin: locked };
  if (A.sameString(String(given), String(cfg.pin))) { await A.clearLimit(env, key); return { ok: true, via: 'pin' }; }
  await A.fail(env, key, 15 * 60); const after = await A.check(env, key, 5); return { ok: false, lockedMin: after || 0 };
}
async function log(env, kind, kid, text) { await env.DB.prepare('INSERT INTO events_log(at,kind,kid,text) VALUES(?,?,?,?)').bind(nowIso(), kind, kid || null, text).run(); }

// ---------- cache ----------
async function cached(env, key, maxAgeMs, fn, force = false) {
  const row = await env.DB.prepare('SELECT value, fetched_at FROM cache WHERE key=?').bind(key).first();
  if (row && !force && Date.now() - Date.parse(row.fetched_at) < maxAgeMs) return JSON.parse(row.value);
  try { const v = await fn(); await env.DB.prepare('INSERT INTO cache(key,value,fetched_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, fetched_at=excluded.fetched_at').bind(key, JSON.stringify(v), nowIso()).run(); return v; }
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
    env.DB.prepare('SELECT * FROM checks WHERE date>=? ORDER BY done_at').bind(since).all().then((r) => r.results),
    env.DB.prepare('SELECT * FROM todos WHERE date>=? AND date<=? ORDER BY date').bind(addDaysYmd(today, -14), addDaysYmd(today, 45)).all().then((r) => r.results),
    env.DB.prepare("SELECT * FROM quest_claims WHERE date>=? OR status='pending' ORDER BY claimed_at DESC").bind(wk).all().then((r) => r.results),
    env.DB.prepare('SELECT kid, kind, SUM(stars) AS stars, SUM(amount) AS amount FROM ledger GROUP BY kid, kind').all().then((r) => r.results),
    env.DB.prepare('SELECT * FROM groceries ORDER BY done, added_at').all().then((r) => r.results),
    env.DB.prepare('SELECT * FROM meals WHERE date>=? AND date<=?').bind(addDaysYmd(today, -7), addDaysYmd(today, 21)).all().then((r) => r.results),
    env.DB.prepare('SELECT * FROM notes WHERE expires_at IS NULL OR expires_at>? ORDER BY created_at DESC').bind(nowIso()).all().then((r) => r.results),
    env.DB.prepare('SELECT * FROM events_log ORDER BY id DESC LIMIT 30').all().then((r) => r.results),
  ]);
  const rewardReqs = (await env.DB.prepare("SELECT * FROM reward_requests WHERE status='pending' OR requested_at>? ORDER BY id DESC").bind(new Date(Date.now() - 14 * 86400000).toISOString()).all()).results;
  const photoIds = cfg.photos?.onScreensaver === false ? [] : (await env.DB.prepare('SELECT id FROM photos WHERE hidden=0 ORDER BY id DESC LIMIT 300').all()).results.map((r) => r.id);
  const lifetimeApproved = await env.DB.prepare("SELECT kid, SUM(stars) AS s FROM quest_claims WHERE status='approved' GROUP BY kid").all().then((r) => Object.fromEntries(r.results.map((x) => [x.kid, x.s])));
  const lifetimeChecks = await env.DB.prepare('SELECT kid, SUM(points) AS s FROM checks GROUP BY kid').all().then((r) => Object.fromEntries(r.results.map((x) => [x.kid, x.s])));
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
      rewardRequests: rewardReqs.filter((r) => r.kid === k.id), pendingClaims: claims.filter((c) => c.kid === k.id && c.status === 'pending'), weekClaims: claims.filter((c) => c.kid === k.id && c.date >= wk) });
  }
  const turnText = instToday.filter((i) => i.turn).map((i) => `${cfg.kids.find((k) => k.id === i.kids[0])?.name} has ${i.title.toLowerCase()} today`).join('. ');
  return { version: env.CF_VERSION_METADATA?.id || 'dev', now: now.toISOString(), today, zone, weekStart: wk, calWeekStart, payDay: addDaysYmd(wk, 6), isSchoolDay: P.isSchoolDay(today, cfg), tomorrowSchool: P.isSchoolDay(addDaysYmd(today, 1), cfg),
    config: publicConfig(cfg), weather, tip, events: evs.events, rewardRequests: rewardReqs, photoIds, calendarStatus: evs.status, sampleData: evs.sample, kids, todos, claims, groceries, meals, notes, turnText, recent: logs, instancesToday: instToday };
}

// ---------- mutations ----------
async function doCheck(env, cfg, body, req) {
  const { kid, id, date, done } = body; if (!kid || !id || !date) return err('kid, id, date required');
  const todos = await env.DB.prepare('SELECT * FROM todos WHERE date=?').bind(date).all().then((r) => r.results);
  const inst = P.instancesForDay(date, cfg, todos).find((i) => i.id === id); if (!inst) return err('no such task today', 404);
  if (!inst.kids.includes(kid)) return err('not this kid\'s task', 403);
  const existing = await env.DB.prepare('SELECT * FROM checks WHERE date=? AND task=?').bind(date, id).first();
  if (done) {
    if (existing) return existing.kid === kid ? json({ ok: true, already: true }) : err('already done by ' + existing.kid, 409, { doneBy: existing.kid });
    await env.DB.prepare('INSERT INTO checks(date,kid,task,points,kind,done_at,by) VALUES(?,?,?,?,?,?,?)').bind(date, kid, id, inst.stars, inst.kind, nowIso(), body.by || 'tap').run();
    if (inst.todoId) await env.DB.prepare('UPDATE todos SET done_at=?, done_by=? WHERE id=?').bind(nowIso(), kid, inst.todoId).run();
    const kname = cfg.kids.find((k) => k.id === kid)?.name || kid; await log(env, 'check', kid, `${kname} finished ${inst.title}`);
    const all = P.instancesForDay(date, cfg, todos).filter((i) => i.kids.includes(kid) && !i.shared); const doneIds = new Set((await env.DB.prepare('SELECT task FROM checks WHERE date=? AND kid=?').bind(date, kid).all()).results.map((r) => r.task));
    if (all.length && all.every((i) => doneIds.has(i.id))) await notify(env, 'done', `${kname} finished everything today 🎉`, `${all.length} tasks, ${all.reduce((s, i) => s + i.stars, 0)} stars`);
    return json({ ok: true, stars: inst.stars });
  }
  if (!existing) return json({ ok: true });
  const age = Date.now() - Date.parse(existing.done_at);
  if (age > P.num(cfg.rules.undoSeconds, 10) * 1000 && !pinOk(req)) return denyAdmin(req);
  await env.DB.prepare('DELETE FROM checks WHERE id=?').bind(existing.id).run();
  if (inst.todoId) await env.DB.prepare('UPDATE todos SET done_at=NULL, done_by=NULL WHERE id=?').bind(inst.todoId).run();
  return json({ ok: true, undone: true });
}
async function addGroceries(env, text, by) {
  const items = String(text).split(/,|\band\b|\n/).map((s) => s.trim()).filter(Boolean); const out = [];
  for (const it of items) {
    const dup = await env.DB.prepare('SELECT id FROM groceries WHERE done=0 AND lower(text)=lower(?)').bind(it).first(); if (dup) { out.push(dup.id); continue; }
    const r = await env.DB.prepare('INSERT INTO groceries(text,aisle,added_by,added_at) VALUES(?,?,?,?)').bind(it, H.aisleFor(it), by || null, nowIso()).run(); out.push(r.meta.last_row_id);
  }
  return out;
}
async function claimQuest(env, cfg, kid, questId, title, stars, today) {
  const q = (cfg.quests || []).find((x) => x.id === questId); const t = q ? q.title : title; const s = q ? q.stars : P.num(stars, 1); if (!t) return err('quest not found', 404);
  const dup = await env.DB.prepare("SELECT id FROM quest_claims WHERE date=? AND kid=? AND title=? AND status!='denied'").bind(today, kid, t).first(); if (dup) return err('already claimed today', 409);
  const status = cfg.rules.questsNeedApproval ? 'pending' : 'approved';
  await env.DB.prepare('INSERT INTO quest_claims(date,kid,quest,title,stars,status,claimed_at,decided_at) VALUES(?,?,?,?,?,?,?,?)').bind(today, kid, q?.id || null, t, s, status, nowIso(), status === 'approved' ? nowIso() : null).run();
  await log(env, 'quest', kid, `${cfg.kids.find((k) => k.id === kid)?.name} claimed ${t}`);
  if (status === 'pending') await notify(env, 'quest', `${cfg.kids.find((k) => k.id === kid)?.name} claimed a quest`, `${t} · ★ ${s}. Tap to approve.`);
  return json({ ok: true, status });
}
async function execVoice(env, cfg, res, body, req, snapshot) {
  const today = snapshot.today; const p = res.params || {};
  switch (res.intent) {
    case 'grocery.add': await addGroceries(env, p.items, body.speaker || 'voice'); break;
    case 'grocery.remove': await env.DB.prepare('UPDATE groceries SET done=1, done_at=? WHERE done=0 AND lower(text) LIKE ?').bind(nowIso(), '%' + p.item.toLowerCase() + '%').run(); break;
    case 'meal.set': await env.DB.prepare('INSERT INTO meals(date,text,who,emoji) VALUES(?,?,?,?) ON CONFLICT(date) DO UPDATE SET text=excluded.text, who=excluded.who').bind(p.date, p.text, body.speaker || null, mealEmoji(p.text)).run(); break;
    case 'note.add': await env.DB.prepare('INSERT INTO notes(text,from_who,created_at,expires_at) VALUES(?,?,?,?)').bind(p.text, body.speaker || 'voice', nowIso(), new Date(Date.now() + 3 * 86400000).toISOString()).run(); break;
    case 'todo.add': await env.DB.prepare('INSERT INTO todos(date,kid,title,stars,created_at) VALUES(?,?,?,?,?)').bind(p.date, p.kid, p.title, 1, nowIso()).run(); break;
    case 'task.check': if (p.id) { const r = await doCheck(env, cfg, { kid: p.kid, id: p.id, date: today, done: true, by: 'voice' }, req); if (r.status >= 400) res.say = 'I could not check that off.'; } break;
    case 'quest.claim': if (p.questId) await claimQuest(env, cfg, p.kid, p.questId, null, null, today); break;
    case 'quest.approve': if (!pinOk(req)) return { ...res, needPin: true, say: 'Say or enter the PIN to approve.' }; { const c = await env.DB.prepare("SELECT * FROM quest_claims WHERE kid=? AND status='pending' ORDER BY id DESC").bind(p.kid).first(); if (c) { await env.DB.prepare("UPDATE quest_claims SET status='approved', decided_at=? WHERE id=?").bind(nowIso(), c.id).run(); res.say = `Approved ${c.title} for ${c.stars} stars.`; } else res.say = 'No quest waiting.'; } break;
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
async function authRoute(env, req, path, cfg, userCount) {
  const name = cfg.family?.name || 'Family Board'; const google = A.googleOn(env); const origin = new URL(req.url).origin;
  if (path === '/auth/signin' && req.method === 'POST') {
    const f = await formOf(req); const email = (f.email || '').trim().toLowerCase(); const ip = ipOf(req);
    const wait = (await A.check(env, 'login:' + email, 5)) || (await A.check(env, 'loginip:' + ip, 30)); if (wait) return A.signInPage({ msg: `Too many tries. Wait ${wait} minute${wait === 1 ? '' : 's'} and try again.`, email, name, google });
    const u = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
    if (!u || !(await A.verifyPassword(f.password || '', u))) { await A.fail(env, 'login:' + email, 15 * 60); await A.fail(env, 'loginip:' + ip, 60 * 60); return A.signInPage({ msg: 'That email and password do not match.', email, name, google }); }
    await A.clearLimit(env, 'login:' + email); await env.DB.prepare('UPDATE users SET last_login=? WHERE id=?').bind(nowIso(), u.id).run();
    const kind = f.display ? 'display' : 'parent'; const token = await A.createSession(env, { userId: u.id, kind, label: (kind === 'display' ? 'Kitchen display · ' : '') + A.deviceLabel(req) });
    return redirect('/', A.sessionCookie(token, kind));
  }
  if (path === '/auth/google') {
    if (!google) return A.simplePage('Google sign-in is not set up yet', 'Use your email and password for now.');
    const q = new URL(req.url).searchParams; const st = await A.googleStart(env, origin, { display: q.get('display') === '1', ticket: (q.get('ticket') || '').replace(/[^0-9a-f]/g, '') });
    return new Response(null, { status: 302, headers: { location: st.url, 'set-cookie': st.cookie } });
  }
  if (path === '/auth/google/callback') {
    if (!google) return redirect('/');
    const g = await A.googleFinish(env, req, origin); const fail = (m) => new Response(A.signInPage({ msg: m, name, google }).body, { status: 401, headers: { 'content-type': 'text/html; charset=utf-8', 'set-cookie': A.clearGoogleCookie() } });
    if (g.error) return fail(g.error);
    let u = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(g.email).first();
    if (g.ticket) {
      const t = await getSetting(env, 'setup_ticket', null); const ok = t && t.expires > Date.now() && A.sameString(await A.sha256hex(g.ticket), t.hash);
      if (!ok) return fail('That setup link expired. Start again from Parents → Sign-in and devices.');
      if (userCount) return fail('Sign-in is already on. Sign in normally.');
      const person = cfg.family.parents.find((p2) => p2.id === t.personId) || cfg.family.parents[0];
      await env.DB.prepare('INSERT OR IGNORE INTO households(id,name,created_at) VALUES(1,?,?)').bind(cfg.family.name || 'Family', nowIso()).run();
      if (!u) { const r = await env.DB.prepare('INSERT INTO users(email,name,person_id,created_at) VALUES(?,?,?,?)').bind(g.email, person.name, person.id, nowIso()).run(); u = { id: r.meta.last_row_id }; }
      await env.DB.prepare("UPDATE users SET pw_hash = COALESCE(pw_hash, 'google'), last_login=? WHERE id=?").bind(nowIso(), u.id).run(); await setSetting(env, 'setup_ticket', null);
    } else if (!u) return fail(`${g.email} isn't on this board yet. Ask the other parent to add it in Parents → Sign-in and devices.`);
    else await env.DB.prepare("UPDATE users SET pw_hash = COALESCE(pw_hash, 'google'), last_login=? WHERE id=?").bind(nowIso(), u.id).run();
    const kind = g.display ? 'display' : 'parent'; const token = await A.createSession(env, { userId: u.id, kind, label: (kind === 'display' ? 'Kitchen display · ' : '') + A.deviceLabel(req) });
    const h = new Headers({ location: g.ticket ? '/?signin=on' : '/' }); h.append('set-cookie', A.sessionCookie(token, kind)); h.append('set-cookie', A.clearGoogleCookie()); return new Response(null, { status: 303, headers: h });
  }
  if (path === '/auth/recover' && req.method === 'POST') {
    const f = await formOf(req); const email = (f.email || '').trim().toLowerCase(); const ip = ipOf(req);
    const wait = (await A.check(env, 'recover:' + ip, 5)); if (wait) return A.signInPage({ msg: `Too many tries. Wait ${wait} minutes.`, name });
    const rec = await getSetting(env, 'recovery', null); const u = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
    const codeOk = rec && A.sameString(await A.sha256hex('rc:' + String(f.code || '').trim().toUpperCase()), rec.hash);
    if (!u || !codeOk) { await A.fail(env, 'recover:' + ip, 60 * 60); return A.signInPage({ msg: 'That email and recovery code do not match.', email, name }); }
    const bad = A.passwordProblem(f.password); if (bad) return A.signInPage({ msg: bad, email, name });
    const h = await A.hashPassword(f.password); await env.DB.prepare('UPDATE users SET pw_hash=?, pw_salt=?, pw_iter=? WHERE id=?').bind(h.hash, h.salt, h.iter, u.id).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id).run(); await A.clearLimit(env, 'login:' + email);
    return A.signInPage({ ok: 'Password changed. Sign in with the new one.', email, name });
  }
  if (path === '/auth/invite') {
    const f = req.method === 'POST' ? await formOf(req) : { t: new URL(req.url).searchParams.get('t') || '' }; const t = (f.t || '').trim();
    const inv = /^[0-9a-f]{64}$/.test(t) ? await env.DB.prepare('SELECT i.*, u.name, u.email FROM invites i JOIN users u ON u.id = i.user_id WHERE i.id=?').bind(await A.sha256hex(t)).first() : null;
    if (!inv || inv.used_at || inv.expires_at < nowIso()) return A.simplePage('This link has expired', 'Ask the other parent to send a new one from Parents → Sign-in and devices.');
    if (req.method !== 'POST') return A.invitePage({ token: t, name: inv.name, email: inv.email });
    if (f.password !== f.password2) return A.invitePage({ token: t, name: inv.name, email: inv.email, msg: 'The two passwords are different.' });
    const bad = A.passwordProblem(f.password); if (bad) return A.invitePage({ token: t, name: inv.name, email: inv.email, msg: bad });
    const h = await A.hashPassword(f.password); await env.DB.prepare('UPDATE users SET pw_hash=?, pw_salt=?, pw_iter=?, last_login=? WHERE id=?').bind(h.hash, h.salt, h.iter, nowIso(), inv.user_id).run();
    await env.DB.prepare('UPDATE invites SET used_at=? WHERE id=?').bind(nowIso(), inv.id).run();
    const token = await A.createSession(env, { userId: inv.user_id, kind: 'parent', label: A.deviceLabel(req) }); return redirect('/', A.sessionCookie(token, 'parent'));
  }
  if (path === '/auth/signout') { const tok = cookieOf(req, 'fbs'); if (tok && /^[0-9a-f]{64}$/.test(tok)) await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(await A.sha256hex(tok)).run(); return redirect('/', A.clearCookie()); }
  return null;
}
async function newInvite(env, userId) { const token = A.randomHex(32); await env.DB.prepare('INSERT INTO invites(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').bind(await A.sha256hex(token), userId, nowIso(), new Date(Date.now() + 7 * 86400000).toISOString()).run(); return token; }

// ---------- push notifications ----------
const KINDS = ['quest', 'reward', 'done', 'feedback', 'morning', 'payday'];
async function vapidKeys(env) { let v = await getSetting(env, 'vapid', null); if (!v) { v = await makeVapid(); await setSetting(env, 'vapid', v); } return v; }
async function notify(env, kind, title, body, url = '/', onlyWho = null) {
  try {
    // Direct sends from the kitchen go to every phone that turned notifications on (or just the chosen person's); other kinds follow each phone's choices.
    const subs = (await env.DB.prepare('SELECT * FROM push_subs').all()).results.filter((x) => { if (onlyWho) return (x.who || '').toLowerCase() === onlyWho.toLowerCase(); if (kind === 'send') return true; try { return JSON.parse(x.prefs || '[]').includes(kind); } catch { return false; } });
    if (!subs.length) return 0; const v = await vapidKeys(env); const subject = (await getSetting(env, 'origin', null)) || 'https://example.invalid';
    const work = Promise.all(subs.map(async (x) => { try { const r = await sendPush({ endpoint: x.endpoint, keys: { p256dh: x.p256dh, auth: x.auth } }, { title, body, url, tag: kind }, v, subject); if (r.gone) await env.DB.prepare('DELETE FROM push_subs WHERE id=?').bind(x.id).run(); else if (r.ok) await env.DB.prepare('UPDATE push_subs SET last_ok=? WHERE id=?').bind(nowIso(), x.id).run(); return r.ok; } catch { return false; } }));
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
    one("SELECT COUNT(*) AS n FROM sessions WHERE kind='display' AND expires_at > ?", nowIso()), one('SELECT COUNT(*) AS n FROM users WHERE pw_hash IS NOT NULL'),
    one('SELECT COUNT(*) AS n FROM push_subs'), one('SELECT COUNT(*) AS n FROM checks'), one('SELECT COUNT(*) AS n FROM meals')]);
  return { calendar: cfg.calendars.some((c) => c.url && c.url !== 'sample'), display: displays > 0, accounts, grownups: cfg.family.parents.length, pushes, checked: checks > 0, meal: meals > 0 };
}
async function morningBriefing(env, cfg, req) {
  const zone = cfg.zone; const now = new Date(); const p = parts(now, zone); const today = ymd(now, zone); const [h, m] = (cfg.notify?.morningAt || '06:45').split(':').map(Number);
  const mins = p.h * 60 + p.mi - (h * 60 + m); if (mins < 0 || mins > 30) return; if ((await getSetting(env, 'briefing', '')) === today) return; await setSetting(env, 'briefing', today);
  const evs = (await getEvents(env, cfg, req).catch(() => ({ events: [] }))).events.filter((e) => e.date === today);
  const wx = await cached(env, wxKey(cfg), 60 * 60 * 1000, () => H.fetchWeather(cfg)).catch(() => null); const d = wx?.days?.find((x) => x.date === today);
  const meal = await env.DB.prepare('SELECT text FROM meals WHERE date=?').bind(today).first();
  const lines = [];
  if (d) lines.push(`${d.icon} ${d.high}°/${d.low}°, ${H.weatherTip(cfg, d, wx.current)}`);
  if (P.isSchoolDay(today, cfg)) lines.push(cfg.kids.map((k) => `${k.name} leaves ${k.leaveTime}`).join(', '));
  lines.push(evs.length ? evs.slice(0, 5).map((e) => `${e.timeLabel} ${e.title}`).join(' · ') : 'Nothing on the calendar');
  if (meal) lines.push(`Dinner: ${meal.text}`);
  await notify(env, 'morning', 'Good morning ☀️', lines.join('\n'));
}

// ---------- router ----------
export default {
  async scheduled(ev, env, ctx) { const cfg = await getConfig(env); const req = new Request('https://family-board.local/'); ctx.waitUntil(Promise.all([getEvents(env, cfg, req, true), cached(env, wxKey(cfg), 0, () => H.fetchWeather(cfg), true), morningBriefing(env, cfg, req), payDayNotice(env, cfg, req).catch(() => {})]).catch(() => {})); },
  async fetch(req, env, ctx) {
    const url = new URL(req.url); const path = url.pathname;
    const userCount = (await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE pw_hash IS NOT NULL').first().catch(() => ({ n: 0 })))?.n || 0;
    const session = userCount ? await A.readSession(env, req) : null;
    if (path.startsWith('/auth/')) { const r = await authRoute(env, req, path, await getConfig(env), userCount); if (r) return r; }
    if (path === '/api/login' && req.method === 'POST') {
      if (userCount) return redirect('/');
      const f = await formOf(req); const code = (f.code || '').trim(); const ip = ipOf(req); const wait = await A.check(env, 'code:' + ip, 10); if (wait) return A.legacyCodePage(`Too many tries. Wait ${wait} minutes.`, !!env.SETUP_CODE);
      const g = await getGate(env);
      if (code && (A.sameString(await sha('fb:' + code), g.hash) || (env.SETUP_CODE && A.sameString(code, String(env.SETUP_CODE).trim())))) { await A.clearLimit(env, 'code:' + ip); return redirect('/', `fb=${g.hash}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax; Secure`); }
      await A.fail(env, 'code:' + ip, 60 * 60); return A.legacyCodePage('That code is not right.', !!env.SETUP_CODE);
    }
    const openPaths = ['/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/apple-touch-icon-precomposed.png', '/manifest.webmanifest', '/api/health'];
    const local = url.hostname.startsWith('localhost') || url.hostname === '127.0.0.1';
    if (!openPaths.includes(path)) {
      if (userCount) { if (!session) return path.startsWith('/api/') ? json({ error: 'sign in', needLogin: true }, 401) : A.signInPage({ name: (await getConfig(env)).family?.name, google: A.googleOn(env) }); }
      else if (!local) { const g = await getGate(env); if (cookieOf(req, 'fb') !== g.hash) return path.startsWith('/api/') ? json({ error: 'sign in', needLogin: true }, 401) : A.legacyCodePage('', !!env.SETUP_CODE); }
    }
    if (!path.startsWith('/api/')) { const r = await env.ASSETS.fetch(req); if (!/\.(js|css|html|webmanifest)$|^\/$/.test(path)) return r; const h = new Headers(r.headers); h.set('cache-control', 'no-cache'); return new Response(r.body, { status: r.status, headers: h }); }
    try {
      const cfg = await getConfig(env); const method = req.method; const body = method === 'GET' ? {} : await req.json().catch(() => ({}));
      const zone = cfg.zone; const today = ymd(new Date(), zone);
      ADMIN.set(req, await decideAdmin(env, req, body, cfg, session, userCount));
      const admin = () => pinOk(req);
      if (path === '/api/board') return json({ ...(await board(env, cfg, req, url)), start: (session?.kind === 'parent' || local) ? await startProgress(env, cfg) : null, me: session ? { kind: session.kind, name: session.user_name, personId: session.person_id } : null, auth: { enabled: !!userCount, local, google: A.googleOn(env) } });
      if (path === '/api/health') return json({ ok: true, time: nowIso() });
      if (path === '/api/version') return json({ version: env.CF_VERSION_METADATA?.id || 'dev' });
      if (path === '/api/reward/request' && method === 'POST') {
        const r = (cfg.rewards || []).find((x) => x.id === body.rewardId); if (!r) return err('no such reward', 404); const k = cfg.kids.find((x) => x.id === body.kid); if (!k) return err('kid', 404);
        const b = await board(env, cfg, req, url); const kk = b.kids.find((x) => x.id === k.id); const pend = kk.rewardRequests.filter((x) => x.status === 'pending').reduce((s2, x) => s2 + x.cost, 0);
        if (kk.wardrobe.balance - pend < r.cost) return err(`Need ${r.cost - (kk.wardrobe.balance - pend)} more stars`, 403);
        await env.DB.prepare('INSERT INTO reward_requests(kid,reward,title,emoji,cost,requested_at) VALUES(?,?,?,?,?,?)').bind(k.id, r.id, r.title, r.emoji || '🎁', r.cost, nowIso()).run();
        await log(env, 'reward', k.id, `${k.name} asked for ${r.title}`); await notify(env, 'reward', `${k.name} wants a reward ${r.emoji || '🎁'}`, `${r.title} · ★ ${r.cost}. Tap to approve.`); return json({ ok: true });
      }
      if (path === '/api/reward/decide' && method === 'POST') {
        if (!admin()) return denyAdmin(req); const rq = await env.DB.prepare('SELECT * FROM reward_requests WHERE id=?').bind(body.id).first(); if (!rq || rq.status !== 'pending') return err('not pending', 409);
        if (body.approve) { const b = await board(env, cfg, req, url); const kk = b.kids.find((x) => x.id === rq.kid); if (!kk || kk.wardrobe.balance < rq.cost) return err('Not enough stars any more', 409);
          await env.DB.prepare('INSERT INTO ledger(week,kid,kind,amount,stars,note,created_at) VALUES(?,?,?,?,?,?,?)').bind(b.weekStart, rq.kid, 'reward', 0, rq.cost, rq.title, nowIso()).run(); }
        await env.DB.prepare('UPDATE reward_requests SET status=?, decided_at=? WHERE id=?').bind(body.approve ? 'approved' : 'denied', nowIso(), rq.id).run(); return json({ ok: true });
      }
      if (path.startsWith('/api/photo/') && method === 'GET') {
        const ph = await env.DB.prepare('SELECT data, mime FROM photos WHERE id=?').bind(+path.split('/')[3]).first(); if (!ph) return err('no photo', 404);
        const bin = Uint8Array.from(atob(ph.data), (c) => c.charCodeAt(0)); return new Response(bin, { headers: { 'content-type': ph.mime, 'cache-control': 'private, max-age=31536000, immutable' } });
      }
      if (path === '/api/photo' && method === 'POST') {
        if (!admin()) return denyAdmin(req); const data = String(body.data || '').replace(/^data:[^,]+,/, ''); if (!data || data.length > 1400000) return err('photo too large');
        const r = await env.DB.prepare('INSERT INTO photos(data,mime,w,h,added_by,created_at) VALUES(?,?,?,?,?,?)').bind(data, body.mime || 'image/jpeg', body.w || null, body.h || null, body.by || null, nowIso()).run(); return json({ ok: true, id: r.meta.last_row_id });
      }
      if (path.startsWith('/api/photo/') && method === 'DELETE') { if (!admin()) return denyAdmin(req); await env.DB.prepare('DELETE FROM photos WHERE id=?').bind(+path.split('/')[3]).run(); return json({ ok: true }); }
      if (path === '/api/push/key') return json({ publicKey: (await vapidKeys(env)).publicKey });
      // The kitchen screen sends the grocery list, today's plan or a note to the grown-ups' phones.
      if (path === '/api/push/send' && method === 'POST') {
        const wait = await A.check(env, 'send:all', 20); if (wait) return err(`That's a lot of sending. Try again in ${wait} minutes.`, 429); await A.fail(env, 'send:all', 10 * 60);
        const what = body.what; let title = '', text = '', link = '/#today';
        if (what === 'groceries') { const g = (await env.DB.prepare('SELECT text FROM groceries WHERE done = 0 ORDER BY id').all()).results; if (!g.length) return err('The grocery list is empty'); title = `🛒 Grocery list (${g.length})`; text = g.map((x) => x.text).join(', '); link = '/#groceries'; }
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
        await env.DB.prepare('INSERT INTO push_subs(endpoint,p256dh,auth,who,prefs,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth, who=excluded.who, prefs=excluded.prefs').bind(sub.endpoint, sub.keys.p256dh, sub.keys.auth, body.who || null, prefs, nowIso()).run();
        return json({ ok: true });
      }
      if (path === '/api/push/unsubscribe' && method === 'POST') { await env.DB.prepare('DELETE FROM push_subs WHERE endpoint=?').bind(body.endpoint || '').run(); return json({ ok: true }); }
      if (path === '/api/push/status' && method === 'POST') { const x = await env.DB.prepare('SELECT who, prefs, last_ok FROM push_subs WHERE endpoint=?').bind(body.endpoint || '').first(); return json(x ? { ...x, prefs: JSON.parse(x.prefs) } : null); }
      if (path === '/api/push/test' && method === 'POST') { if (!admin()) return denyAdmin(req); const all = (await env.DB.prepare('SELECT * FROM push_subs WHERE endpoint=?').bind(body.endpoint || '').all()).results; if (!all.length) return err('This device is not signed up yet', 404); const v = await vapidKeys(env); const x = all[0]; const r = await sendPush({ endpoint: x.endpoint, keys: { p256dh: x.p256dh, auth: x.auth } }, { title: cfg.family?.name || 'Family Board', body: `${cfg.family?.dog ? cfg.family.dog + ' says hi! ' : ''}Notifications work for ${x.who || 'you'}.`, url: '/' }, v, url.origin); return r.ok ? json({ ok: true }) : err('Push service said ' + r.status, 502); }
      if (path === '/api/tts') {
        const text = (url.searchParams.get('t') || '').slice(0, 400).trim(); const voice = (url.searchParams.get('v') || cfg.voice.cloudVoice || 'thalia').replace(/[^a-z]/g, '');
        if (!text || !env.AI) return err('no voice', 404);
        const key = new Request(`https://tts.cache/${voice}/${encodeURIComponent(text)}`); const hit = await caches.default.match(key); if (hit) return hit;
        try {
          const out = await env.AI.run('@cf/deepgram/aura-2-en', { text, speaker: voice, encoding: 'mp3' });
          const buf = out instanceof ReadableStream ? await new Response(out).arrayBuffer() : out?.audio ? Uint8Array.from(atob(out.audio), (c) => c.charCodeAt(0)) : out;
          const res = new Response(buf, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=2592000' } });
          ctx.waitUntil(caches.default.put(key, new Response(buf, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'public, max-age=2592000' } })));
          return res;
        } catch (e) { return err('voice unavailable: ' + (e.message || e), 503); }
      }
      if (path === '/api/units' && method === 'POST') { cfg.weather.units = body.units === 'celsius' ? 'celsius' : 'fahrenheit'; await saveConfig(env, cfg); return json({ ok: true, units: cfg.weather.units }); }
      if (path === '/api/feedback' && method === 'POST') {
        const text = String(body.text || '').trim(); if (!text) return err('say something first');
        let issueUrl = null; const m = /github\.com\/([^/]+)\/([^/#?]+)/.exec(cfg.feedbackUrl || '');
        if (m && env.GITHUB_TOKEN) { try { const r = await fetch(`https://api.github.com/repos/${m[1]}/${m[2].replace(/\.git$/, '')}/issues`, { method: 'POST', headers: { authorization: 'Bearer ' + env.GITHUB_TOKEN, 'content-type': 'application/json', 'user-agent': 'family-board', accept: 'application/vnd.github+json' }, body: JSON.stringify({ title: text.slice(0, 70) + (text.length > 70 ? '…' : ''), body: `${text}\n\n_From ${body.from || 'the board'} on page "${body.page || ''}"_`, labels: ['feedback'] }) }); if (r.ok) issueUrl = (await r.json()).html_url; } catch {} }
        await env.DB.prepare('INSERT INTO feedback(text,from_who,page,created_at,issue_url) VALUES(?,?,?,?,?)').bind(text, body.from || null, body.page || null, nowIso(), issueUrl).run();
        await log(env, 'feedback', null, `${body.from || 'Someone'}: ${text.slice(0, 80)}`); await notify(env, 'feedback', `Feedback from ${body.from || 'someone'}`, text.slice(0, 160)); return json({ ok: true, issueUrl });
      }
      if (path === '/api/feedback' && method === 'GET') return json((await env.DB.prepare('SELECT * FROM feedback ORDER BY id DESC LIMIT 100').all()).results);
      if (path.startsWith('/api/feedback/') && method === 'POST') { const id = +path.split('/')[3]; await env.DB.prepare('UPDATE feedback SET status=? WHERE id=?').bind(body.status || 'done', id).run(); return json({ ok: true }); }
      if (path === '/api/check' && method === 'POST') return doCheck(env, cfg, body, req);
      if (path === '/api/todo' && method === 'POST') { if (!body.title) return err('title required'); await env.DB.prepare('INSERT INTO todos(date,kid,title,stars,created_at) VALUES(?,?,?,?,?)').bind(body.date || today, body.kid || null, body.title, P.num(body.stars, 1), nowIso()).run(); return json({ ok: true }); }
      if (path.startsWith('/api/todo/') && method === 'DELETE') { if (!admin()) return denyAdmin(req); await env.DB.prepare('DELETE FROM todos WHERE id=?').bind(+path.split('/')[3]).run(); return json({ ok: true }); }
      if (path === '/api/quest/claim' && method === 'POST') return claimQuest(env, cfg, body.kid, body.questId, body.title, body.stars, today);
      if (path === '/api/quest/decide' && method === 'POST') { if (!admin()) return denyAdmin(req); await env.DB.prepare('UPDATE quest_claims SET status=?, decided_at=? WHERE id=?').bind(body.approve ? 'approved' : 'denied', nowIso(), body.id).run(); return json({ ok: true }); }
      if (path === '/api/wardrobe/look' && method === 'POST') { const ward = await getSetting(env, 'wardrobe:' + body.kid, { owned: [], look: {} }); ward.look = body.look || {}; await setSetting(env, 'wardrobe:' + body.kid, ward); return json({ ok: true }); }
      if (path === '/api/wardrobe/buy' && method === 'POST') {
        const item = cfg.wardrobe.catalog.find((i) => i.id === body.itemId); if (!item) return err('no item', 404); const ward = await getSetting(env, 'wardrobe:' + body.kid, { owned: [], look: {} });
        if (ward.owned.includes(item.id)) return json({ ok: true, already: true }); if (item.prizeOnly) return err('prize only', 403);
        const b = await board(env, cfg, req, url); const k = b.kids.find((x) => x.id === body.kid); if (!k) return err('kid', 404);
        if (item.minLevel && k.level.level < item.minLevel) return err(`Level ${item.minLevel} needed`, 403); if (k.wardrobe.balance < item.cost) return err('Not enough stars yet', 403);
        if (item.cost > 0) await env.DB.prepare('INSERT INTO ledger(week,kid,kind,amount,stars,note,created_at) VALUES(?,?,?,?,?,?,?)').bind(b.weekStart, body.kid, 'wardrobe', 0, item.cost, item.label, nowIso()).run();
        ward.owned.push(item.id); await setSetting(env, 'wardrobe:' + body.kid, ward); return json({ ok: true });
      }
      if (path === '/api/goal' && method === 'POST') { await setSetting(env, 'goal:' + body.kid, body.goal || null); return json({ ok: true }); }
      if (path === '/api/grocery' && method === 'POST') { const ids = await addGroceries(env, body.text, body.by); return json({ ok: true, ids }); }
      if (path.startsWith('/api/grocery/') && method === 'POST') {
        const [, , , id, act] = path.split('/'); if (id === 'clear') { await env.DB.prepare('DELETE FROM groceries WHERE done=1').run(); return json({ ok: true }); }
        if (act === 'toggle') { await env.DB.prepare('UPDATE groceries SET done=1-done, done_at=? WHERE id=?').bind(nowIso(), +id).run(); return json({ ok: true }); }
        if (act === 'aisle') { await env.DB.prepare('UPDATE groceries SET aisle=? WHERE id=?').bind(body.aisle, +id).run(); return json({ ok: true }); }
      }
      if (path.startsWith('/api/grocery/') && method === 'DELETE') { await env.DB.prepare('DELETE FROM groceries WHERE id=?').bind(+path.split('/')[3]).run(); return json({ ok: true }); }
      if (path === '/api/meal' && method === 'PUT') { if (!body.text) { await env.DB.prepare('DELETE FROM meals WHERE date=?').bind(body.date).run(); return json({ ok: true }); } await env.DB.prepare('INSERT INTO meals(date,text,who,emoji,ingredients) VALUES(?,?,?,?,?) ON CONFLICT(date) DO UPDATE SET text=excluded.text, who=excluded.who, emoji=excluded.emoji, ingredients=excluded.ingredients').bind(body.date, body.text, body.who || null, body.emoji || mealEmoji(body.text), body.ingredients || null).run(); return json({ ok: true }); }
      if (path === '/api/meal/shop' && method === 'POST') { const m = await env.DB.prepare('SELECT * FROM meals WHERE date=?').bind(body.date).first(); if (!m?.ingredients) return err('no ingredients'); await addGroceries(env, m.ingredients, 'dinner'); return json({ ok: true }); }
      if (path === '/api/note' && method === 'POST') { await env.DB.prepare('INSERT INTO notes(text,from_who,created_at,expires_at) VALUES(?,?,?,?)').bind(body.text, body.from || null, nowIso(), body.days ? new Date(Date.now() + body.days * 86400000).toISOString() : null).run(); return json({ ok: true }); }
      if (path.startsWith('/api/note/') && method === 'DELETE') { await env.DB.prepare('DELETE FROM notes WHERE id=?').bind(+path.split('/')[3]).run(); return json({ ok: true }); }
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
          const users = (await env.DB.prepare("SELECT id, email, name, person_id, created_at, last_login, pw_hash IS NOT NULL AS active, (pw_hash IS NOT NULL AND pw_hash != 'google') AS has_password FROM users ORDER BY id").all()).results;
          const sessions = (await env.DB.prepare('SELECT s.id, s.kind, s.label, s.created_at, s.last_seen, u.name AS user_name FROM sessions s LEFT JOIN users u ON u.id = s.user_id WHERE s.expires_at > ? ORDER BY s.last_seen DESC').bind(nowIso()).all()).results.map((x) => ({ ...x, id: x.id.slice(0, 16), current: session?.id === x.id }));
          return json({ enabled: !!userCount, google: A.googleOn(env), users, sessions, me: session ? { kind: session.kind, userId: session.user_id } : null, hasRecovery: !!(await getSetting(env, 'recovery', null)) });
        }
        if (sub === 'setup' && method === 'POST') {
          if (userCount) return err('Sign-in is already on', 409); const email = String(body.email || '').trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err('Enter a valid email');
          const bad = A.passwordProblem(body.password); if (bad) return err(bad); const person = cfg.family.parents.find((p2) => p2.id === body.personId) || cfg.family.parents[0];
          const h = await A.hashPassword(body.password); await env.DB.prepare('INSERT OR IGNORE INTO households(id,name,created_at) VALUES(1,?,?)').bind(cfg.family.name || 'Family', nowIso()).run();
          const r = await env.DB.prepare('INSERT INTO users(email,name,person_id,pw_hash,pw_salt,pw_iter,created_at,last_login) VALUES(?,?,?,?,?,?,?,?)').bind(email, person.name, person.id, h.hash, h.salt, h.iter, nowIso(), nowIso()).run();
          const code = A.recoveryCode(); await setSetting(env, 'recovery', { hash: await A.sha256hex('rc:' + code), created_at: nowIso() });
          const kind = body.display ? 'display' : 'parent'; const token = await A.createSession(env, { userId: r.meta.last_row_id, kind, label: (kind === 'display' ? 'Kitchen display · ' : '') + A.deviceLabel(req) });
          return new Response(JSON.stringify({ ok: true, recoveryCode: code }), { headers: { 'content-type': 'application/json', 'set-cookie': A.sessionCookie(token, kind) } });
        }
        if (sub === 'setup-google' && method === 'POST') {
          if (userCount) return err('Sign-in is already on', 409); if (!A.googleOn(env)) return err('Google sign-in is not set up yet');
          const ticket = A.randomHex(32); await setSetting(env, 'setup_ticket', { hash: await A.sha256hex(ticket), personId: body.personId, expires: Date.now() + 10 * 60 * 1000 });
          return json({ ok: true, url: `/auth/google?ticket=${ticket}${body.display ? '&display=1' : ''}` });
        }
        if (sub === 'invite' && method === 'POST') {
          if (!userCount) return err('Turn on sign-in first'); const email = String(body.email || '').trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err('Enter a valid email');
          const person = cfg.family.parents.find((p2) => p2.id === body.personId); let u = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
          if (!u) { const r = await env.DB.prepare('INSERT INTO users(email,name,person_id,created_at) VALUES(?,?,?,?)').bind(email, person?.name || body.name || email.split('@')[0], person?.id || null, nowIso()).run(); u = { id: r.meta.last_row_id }; }
          const token = await newInvite(env, u.id); return json({ ok: true, link: `${url.origin}/auth/invite?t=${token}` });
        }
        if (sub === 'reset-user' && method === 'POST') { const u = await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(+body.userId).first(); if (!u) return err('no such account', 404); await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id).run(); const token = await newInvite(env, u.id); return json({ ok: true, link: `${url.origin}/auth/invite?t=${token}` }); }
        if (sub === 'remove-user' && method === 'POST') { if (+body.userId === session?.user_id) return err('You cannot remove yourself'); const left = (await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE pw_hash IS NOT NULL AND id != ?').bind(+body.userId).first()).n; if (!left) return err('Keep at least one parent account'); await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(+body.userId).run(); await env.DB.prepare('DELETE FROM users WHERE id=?').bind(+body.userId).run(); return json({ ok: true }); }
        if (sub === 'revoke' && method === 'POST') { await env.DB.prepare('DELETE FROM sessions WHERE substr(id,1,16)=?').bind(String(body.id || '')).run(); return json({ ok: true }); }
        if (sub === 'revoke-others' && method === 'POST') { await env.DB.prepare('DELETE FROM sessions WHERE id != ?').bind(session?.id || '').run(); return json({ ok: true }); }
        if (sub === 'device-kind' && method === 'POST') { if (!session) return err('not signed in'); const kind = body.kind === 'display' ? 'display' : 'parent'; await env.DB.prepare('UPDATE sessions SET kind=?, label=? WHERE id=?').bind(kind, (kind === 'display' ? 'Kitchen display · ' : '') + A.deviceLabel(req), session.id).run(); return json({ ok: true }); }
        if (sub === 'password' && method === 'POST') { if (!session?.user_id) return err('Sign in on this device first'); const u = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(session.user_id).first(); if (!(await A.verifyPassword(String(body.old || ''), u))) return err('Your current password is not right'); const bad = A.passwordProblem(body.password); if (bad) return err(bad); const h = await A.hashPassword(body.password); await env.DB.prepare('UPDATE users SET pw_hash=?, pw_salt=?, pw_iter=? WHERE id=?').bind(h.hash, h.salt, h.iter, u.id).run(); await env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND id != ?').bind(u.id, session.id).run(); return json({ ok: true }); }
        if (sub === 'recovery' && method === 'POST') { const code = A.recoveryCode(); await setSetting(env, 'recovery', { hash: await A.sha256hex('rc:' + code), created_at: nowIso() }); return json({ ok: true, recoveryCode: code }); }
        if (sub === 'gate' && method === 'GET') return json(await getGate(env));
        if (sub === 'gate' && method === 'POST') { const code = String(body.code || '').trim(); if (!/^\d{4,8}$/.test(code)) return err('4 to 8 digits'); await setSetting(env, 'gate', { code, hash: await sha('fb:' + code) }); return json({ ok: true }); }
        if (sub === 'config' && method === 'PUT') { const next = { ...cfg, ...body.config, pin: body.config?.pin || cfg.pin }; await saveConfig(env, next); return json({ ok: true }); }
        if (sub === 'refresh') { const r = await getEvents(env, cfg, req, true); await cached(env, wxKey(cfg), 0, () => H.fetchWeather(cfg), true).catch(() => {}); return json({ ok: true, status: r.status }); }
        if (sub === 'payout') { await env.DB.prepare('INSERT INTO ledger(week,kid,kind,amount,stars,note,created_at) VALUES(?,?,?,?,?,?,?)').bind(body.week, body.kid, 'payout', P.num(body.amount, 0), 0, body.note || null, nowIso()).run(); if (body.jar) await env.DB.prepare('INSERT INTO ledger(week,kid,kind,amount,stars,note,created_at) VALUES(?,?,?,?,?,?,?)').bind(body.week, body.kid, 'jar', P.num(body.jar, 0), 0, 'to savings jar', nowIso()).run(); return json({ ok: true }); }
        if (sub === 'grant') { await env.DB.prepare('INSERT INTO ledger(week,kid,kind,amount,stars,note,created_at) VALUES(?,?,?,?,?,?,?)').bind(today, body.kid, 'grant', 0, P.num(body.stars, 0), body.note || null, nowIso()).run(); if (body.itemId) { const w = await getSetting(env, 'wardrobe:' + body.kid, { owned: [], look: {} }); if (!w.owned.includes(body.itemId)) w.owned.push(body.itemId); await setSetting(env, 'wardrobe:' + body.kid, w); } return json({ ok: true }); }
        if (sub === 'history') { const l = await env.DB.prepare('SELECT * FROM ledger ORDER BY created_at DESC LIMIT 200').all(); const c = await env.DB.prepare("SELECT date, kid, SUM(points) AS stars, COUNT(*) AS n FROM checks WHERE date>=? GROUP BY date, kid ORDER BY date DESC").bind(addDaysYmd(today, -84)).all(); return json({ ledger: l.results, days: c.results }); }
        if (sub === 'log') return json((await env.DB.prepare('SELECT * FROM events_log ORDER BY id DESC LIMIT 200').all()).results);
        if (sub === 'uncheck') { await env.DB.prepare('DELETE FROM checks WHERE date=? AND task=?').bind(body.date, body.id).run(); return json({ ok: true }); }
        if (sub === 'test-calendar') { try { const text = await loadIcs(env, body.url, req); const n = parseICS(text, zone).length; return json({ ok: true, events: n }); } catch (e) { return err(e.message); } }
      }
      return err('not found', 404);
    } catch (e) { return err(e.message || String(e), 500); }
  },
};
