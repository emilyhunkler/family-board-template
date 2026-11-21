// Scheduling, stars, dollars, streaks, levels. Pure functions; dates are 'YYYY-MM-DD' strings.
import { addDaysYmd, weekdayOfYmd } from './ical.js';

export const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
export function dayNumber(ymd) { const [y, m, d] = ymd.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); }
// The allowance week ends on pay day (default Sunday, so it starts Monday as before).
// A new pay day starts once the week running when it was changed has ended (week.payDayFrom: { from, prev }),
// so a week already paid is never paid again and no days are skipped.
const setPayDay = (cfg) => (Number.isInteger(cfg.week?.payDay) ? cfg.week.payDay : ((cfg.week?.startsOn ?? 1) + 6) % 7);
export const payDayOf = (cfg, ymd) => { const ch = cfg.week?.payDayFrom; return ymd && ch?.from && Number.isInteger(ch.prev) && ymd < ch.from ? ch.prev : setPayDay(cfg); };
export const payWeekStart = (ymd, cfg) => weekStart(ymd, (payDayOf(cfg, ymd) + 1) % 7);
// next: the config about to be saved. When its pay day differs from the one in use today, the change waits
// until the day after this week's pay day. Changing it back before then cancels the change.
// opts.now: the family has never had a pay day yet, so a new pay day can start straight away.
export function withPayDayChange(cur, next, today, opts = {}) {
  if (!next?.week) return next;
  if (opts.now) { delete next.week.payDayFrom; return next; } const inUse = payDayOf(cur, today); const wanted = setPayDay(next); const ch = cur.week?.payDayFrom;
  const pending = ch?.from && today < ch.from;
  if (pending) { if (wanted === ch.prev) delete next.week.payDayFrom; else next.week.payDayFrom = { ...ch }; return next; }
  if (wanted === inUse) { if (ch) next.week.payDayFrom = { ...ch }; else delete next.week.payDayFrom; return next; }
  next.week.payDayFrom = { from: addDaysYmd(payWeekStart(today, cur), 7), prev: inUse };
  return next;
}
export function weekStart(ymd, startsOn = 1) { const back = (weekdayOfYmd(ymd) - startsOn + 7) % 7; return addDaysYmd(ymd, -back); }
export function isSchoolDay(ymd, cfg) {
  const s = cfg.school || {}; if ((s.daysOff || []).includes(ymd)) return false; if ((s.extraDays || []).includes(ymd)) return true;
  return (s.days || [1, 2, 3, 4, 5]).includes(weekdayOfYmd(ymd));
}
// Concrete task instances for a day. Each instance has kids: who may do it; shared: first-come.
export function instancesForDay(ymd, cfg, todos = []) {
  const kids = cfg.kids.map((k) => k.id); const wd = weekdayOfYmd(ymd); const school = isSchoolDay(ymd, cfg); const out = [];
  // Each take-turns task gets its own offset, so on a given day the turns are split between the kids.
  const turnSlot = new Map((cfg.tasks || []).filter((t) => t.who === 'either' && t.rotate).map((t, i) => [t.id, i]));
  for (const t of cfg.tasks || []) {
    if (!(t.days || []).includes(wd)) continue; if (t.when === 'morning' && !school) continue;
    const base = { taskId: t.id, title: t.title, emoji: t.emoji || '✅', stars: num(t.stars, 1), when: t.when || 'after', timerMin: num(t.timerMin, 0), kind: 'task' };
    if (t.who === 'both') for (const k of kids) out.push({ ...base, id: `${t.id}:${k}`, kids: [k], shared: false });
    else if (t.who === 'either') {
      if (t.rotate) { const k = kids[(dayNumber(ymd) + (turnSlot.get(t.id) || 0)) % kids.length]; out.push({ ...base, id: `${t.id}:turn`, kids: [k], shared: false, turn: true }); }
      else out.push({ ...base, id: `${t.id}:any`, kids, shared: true });
    } else if (kids.includes(t.who)) out.push({ ...base, id: `${t.id}:${t.who}`, kids: [t.who], shared: false });
  }
  for (const td of todos.filter((x) => x.date === ymd)) {
    const ks = td.kid && kids.includes(td.kid) ? [td.kid] : kids;
    out.push({ taskId: `todo:${td.id}`, id: `todo:${td.id}`, todoId: td.id, title: td.title, emoji: '📌', stars: num(td.stars, 1), when: 'after', timerMin: 0, kind: 'todo', kids: ks, shared: ks.length > 1 });
  }
  return out;
}
// A done take-turns chore belongs to whoever did it, even if the turns have moved since
// (a chore added or reordered changes whose turn each day is). Undone ones follow today's turns.
export const ownersOf = (inst, c) => (inst.turn && c ? [c.kid] : inst.kids);
// The chores for a day. Days that are over use the list saved that day (plans: date -> instances),
// so editing chores later doesn't rewrite them. Today and later days use the chores as they are now.
export function planFor(ymd, cfg, todos, plans, today) {
  if (plans && today && ymd < today && Array.isArray(plans[ymd])) return plans[ymd];
  return instancesForDay(ymd, cfg, todos);
}
// checks: rows {date, kid, task(instance id), points}
export function kidDay(kidId, ymd, cfg, instances, checks) {
  const byTask = new Map(); for (const c of checks) if (c.date === ymd) byTask.set(c.task, c);
  const list = [];
  for (const inst of instances) {
    const c = byTask.get(inst.id); if (!ownersOf(inst, c).includes(kidId)) continue;
    list.push({ ...inst, done: !!c, doneBy: c ? c.kid : null, doneAt: c ? c.done_at : null, doneByOther: !!c && c.kid !== kidId });
  }
  return list;
}
// Required stars for the kid on that day (possible / earned)
// items: the kid's chores that day, each with done and whether its stars counted (for the progress chart).
function dayPoints(kidId, instances, checksForDay, cfg) {
  let possible = 0, earned = 0, scheduled = 0, done = 0; const items = []; const byTask = new Map(checksForDay.map((c) => [c.task, c]));
  const mine = instances.filter((i) => ownersOf(i, byTask.get(i.id)).includes(kidId));
  const morningInst = mine.filter((i) => i.when === 'morning' && !i.shared);
  const morningDone = morningInst.every((i) => byTask.get(i.id)?.kid === kidId);
  for (const inst of mine) {
    const c = byTask.get(inst.id); const item = { id: inst.id, title: inst.title, emoji: inst.emoji, stars: inst.stars, when: inst.when, shared: !!inst.shared, done: false, counted: false };
    if (inst.shared) { if (c && c.kid === kidId) { possible += inst.stars; earned += inst.stars; scheduled++; done++; items.push({ ...item, done: true, counted: true }); } continue; }
    scheduled++; possible += inst.stars;
    if (c && c.kid === kidId) { done++; item.done = true; if (inst.when === 'morning' || !cfg.rules?.morningGate || morningDone) { earned += inst.stars; item.counted = true; } }
    items.push(item);
  }
  return { possible, earned, scheduled, done, items };
}
export function roundDown(a, step = 0.25) { return Math.floor((a + 1e-9) / step) * step; }
// week: checks across the week, todos across the week, approved claims in the week
// startPossible: the stars the kid could earn this week as it stood when the week began (saved by the board).
// Pay works from that bar, so chores or one-off jobs added during the week are a chance to earn more and
// never pull the total down. Taking chores away lowers the bar, so the total can only go up. Pay never
// goes over the weekly allowance.
export function weekSummary(kid, wkStart, cfg, checks, todos, claims, today, plans, startPossible) {
  const days = []; let possible = 0, earned = 0, misses = 0, left = 0;
  // The first week on a new pay day starts on the day the change took effect; days before it were paid in the old week.
  const ch = cfg.week?.payDayFrom; const freeBefore = ch?.from && wkStart < ch.from && addDaysYmd(wkStart, 6) >= ch.from ? ch.from : null;
  const approved = claims.filter((c) => c.kid === kid.id && c.status === 'approved');
  for (let i = 0; i < 7; i++) {
    const d = addDaysYmd(wkStart, i); const bonus = approved.filter((c) => c.date === d).reduce((s, c) => s + num(c.stars, 0), 0);
    // Days before the family started using the board don't count, so a first partial week isn't full of misses.
    if ((cfg.week?.startedOn && d < cfg.week.startedOn) || (freeBefore && d < freeBefore)) { days.push({ date: d, status: 'free', possible: 0, earned: 0, scheduled: 0, done: 0, missed: 0, open: 0, bonus, items: [] }); continue; }
    const inst = planFor(d, cfg, todos, plans, today); const dc = checks.filter((c) => c.date === d);
    const p = dayPoints(kid.id, inst, dc, cfg); possible += p.possible; earned += p.earned;
    let status; if (d > today) status = 'upcoming'; else if (p.scheduled === 0) status = 'free'; else if (p.done >= p.scheduled) status = 'full'; else if (d === today) status = p.done ? 'part' : 'open'; else status = p.done ? 'part' : 'miss';
    if (d < today) misses += Math.max(0, p.scheduled - p.done);
    // Stars that slipped by (days that are over) and stars still there to earn (today and later).
    const notYet = p.possible - p.earned; const missed = d < today ? notYet : 0, open = d >= today ? notYet : 0; left += open;
    days.push({ date: d, status, ...p, missed, open, bonus });
  }
  const max = num(kid.weeklyAllowance, 0); const step = cfg.rules?.roundTo || 0.25; const bar = startPossible > 0 ? Math.min(startPossible, possible) : possible;
  const pay = (stars) => (bar ? roundDown(Math.min(max, max * stars / bar), step) : 0); const base = pay(earned), canReach = pay(earned + left); const bonusStars = approved.reduce((s, c) => s + num(c.stars, 0), 0);
  const spd = num(cfg.rules?.starsPerDollar, 10); const bonusDollars = spd ? Math.floor((bonusStars / spd) * 100) / 100 : 0;
  const prize = cfg.prize || {}; const needStars = num(prize.bonusStars, 0), allowed = num(prize.missesAllowed, 0);
  const prizeProgress = Math.min(1, ((misses <= allowed ? 0.5 : 0) + 0.5 * Math.min(1, needStars ? bonusStars / needStars : 1)));
  return { weekStart: wkStart, possible, bar, earned, left, canReach, max, base, bonusStars, bonusDollars, total: Math.round((base + bonusDollars) * 100) / 100, misses, days,
    prize: { ...prize, misses, missesAllowed: allowed, bonusStars, bonusNeeded: needStars, onTrack: misses <= allowed, progress: prizeProgress, earned: misses <= allowed && bonusStars >= needStars && today > addDaysYmd(wkStart, 6) } };
}
// consecutive full days ending yesterday (or today if complete). checksByDate: Map date -> rows; lookback 60 days
export function streak(kid, cfg, checks, todos, today, plans) {
  let n = 0; let d = today; const inst = instancesForDay(d, cfg, todos); const p = dayPoints(kid.id, inst, checks.filter((c) => c.date === d), cfg);
  if (p.scheduled && p.done >= p.scheduled) n++; d = addDaysYmd(d, -1);
  for (let i = 0; i < 90; i++, d = addDaysYmd(d, -1)) {
    const ins = planFor(d, cfg, todos, plans, today); const q = dayPoints(kid.id, ins, checks.filter((c) => c.date === d), cfg);
    if (!q.scheduled) continue; if (q.done >= q.scheduled) n++; else break;
  }
  return n;
}
export function level(lifetime, cfg) {
  const per = num(cfg.rules?.levelStars, 100); const names = cfg.rules?.levelNames || ['Sprout']; const lv = Math.floor(lifetime / per) + 1;
  return { level: lv, name: names[Math.min(names.length - 1, lv - 1)], into: lifetime % per, per, toNext: per - (lifetime % per) };
}
