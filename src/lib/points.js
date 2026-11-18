// Scheduling, stars, dollars, streaks, levels. Pure functions; dates are 'YYYY-MM-DD' strings.
import { addDaysYmd, weekdayOfYmd } from './ical.js';

export const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
export function dayNumber(ymd) { const [y, m, d] = ymd.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); }
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
// checks: rows {date, kid, task(instance id), points}
export function kidDay(kidId, ymd, cfg, instances, checks) {
  const byTask = new Map(); for (const c of checks) if (c.date === ymd) byTask.set(c.task, c);
  const list = [];
  for (const inst of instances) {
    const c = byTask.get(inst.id); const mine = inst.kids.includes(kidId);
    if (!mine && !(inst.turn && inst.kids.length)) continue;
    if (!mine) continue;
    list.push({ ...inst, done: !!c, doneBy: c ? c.kid : null, doneAt: c ? c.done_at : null, doneByOther: !!c && c.kid !== kidId });
  }
  return list;
}
// Required stars for the kid on that day (possible / earned)
function dayPoints(kidId, instances, checksForDay, cfg) {
  let possible = 0, earned = 0, scheduled = 0, done = 0; const byTask = new Map(checksForDay.map((c) => [c.task, c]));
  const morningInst = instances.filter((i) => i.when === 'morning' && i.kids.includes(kidId) && !i.shared);
  const morningDone = morningInst.every((i) => byTask.get(i.id)?.kid === kidId);
  for (const inst of instances) {
    if (!inst.kids.includes(kidId)) continue; const c = byTask.get(inst.id);
    if (inst.shared) { if (c && c.kid === kidId) { possible += inst.stars; earned += inst.stars; scheduled++; done++; } continue; }
    scheduled++; possible += inst.stars;
    if (c && c.kid === kidId) { done++; if (inst.when === 'morning' || !cfg.rules?.morningGate || morningDone) earned += inst.stars; }
  }
  return { possible, earned, scheduled, done };
}
export function roundDown(a, step = 0.25) { return Math.floor((a + 1e-9) / step) * step; }
// week: checks across the week, todos across the week, approved claims in the week
export function weekSummary(kid, wkStart, cfg, checks, todos, claims, today) {
  const days = []; let possible = 0, earned = 0, misses = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDaysYmd(wkStart, i); const inst = instancesForDay(d, cfg, todos); const dc = checks.filter((c) => c.date === d);
    const p = dayPoints(kid.id, inst, dc, cfg); possible += p.possible; earned += p.earned;
    let status; if (d > today) status = 'upcoming'; else if (p.scheduled === 0) status = 'free'; else if (p.done >= p.scheduled) status = 'full'; else if (d === today) status = p.done ? 'part' : 'open'; else status = p.done ? 'part' : 'miss';
    if (d < today) misses += Math.max(0, p.scheduled - p.done);
    days.push({ date: d, status, ...p });
  }
  const max = num(kid.weeklyAllowance, 0); const base = possible ? roundDown(max * earned / possible, cfg.rules?.roundTo || 0.25) : 0;
  const approved = claims.filter((c) => c.kid === kid.id && c.status === 'approved'); const bonusStars = approved.reduce((s, c) => s + num(c.stars, 0), 0);
  const spd = num(cfg.rules?.starsPerDollar, 10); const bonusDollars = spd ? Math.floor((bonusStars / spd) * 100) / 100 : 0;
  const prize = cfg.prize || {}; const needStars = num(prize.bonusStars, 0), allowed = num(prize.missesAllowed, 0);
  const prizeProgress = Math.min(1, ((misses <= allowed ? 0.5 : 0) + 0.5 * Math.min(1, needStars ? bonusStars / needStars : 1)));
  return { weekStart: wkStart, possible, earned, max, base, bonusStars, bonusDollars, total: Math.round((base + bonusDollars) * 100) / 100, misses, days,
    prize: { ...prize, misses, missesAllowed: allowed, bonusStars, bonusNeeded: needStars, onTrack: misses <= allowed, progress: prizeProgress, earned: misses <= allowed && bonusStars >= needStars && today > addDaysYmd(wkStart, 6) } };
}
// consecutive full days ending yesterday (or today if complete). checksByDate: Map date -> rows; lookback 60 days
export function streak(kid, cfg, checks, todos, today) {
  let n = 0; let d = today; const inst = instancesForDay(d, cfg, todos); const p = dayPoints(kid.id, inst, checks.filter((c) => c.date === d), cfg);
  if (p.scheduled && p.done >= p.scheduled) n++; d = addDaysYmd(d, -1);
  for (let i = 0; i < 90; i++, d = addDaysYmd(d, -1)) {
    const ins = instancesForDay(d, cfg, todos); const q = dayPoints(kid.id, ins, checks.filter((c) => c.date === d), cfg);
    if (!q.scheduled) continue; if (q.done >= q.scheduled) n++; else break;
  }
  return n;
}
export function level(lifetime, cfg) {
  const per = num(cfg.rules?.levelStars, 100); const names = cfg.rules?.levelNames || ['Sprout']; const lv = Math.floor(lifetime / per) + 1;
  return { level: lv, name: names[Math.min(names.length - 1, lv - 1)], into: lifetime % per, per, toNext: per - (lifetime % per) };
}
