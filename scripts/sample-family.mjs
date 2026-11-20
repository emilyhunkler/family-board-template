// Prints SQL that fills the TEST COPY with a pretend family, so there's something to look at without
// setting one up by hand: two kids, the usual chores, this week so far with some chores done and some
// missed, and one chore ("Feed the dog") added mid-week, the way a grown-up might add one. Pay day is today,
// and Lily has $4.00 saved from before, so the kids' bank has something to show.
// It replaces family 1 on whatever database it's run against, so the workflow only ever runs it against
// the test copy (wrangler --env staging). Never run it against the live board.
//   node scripts/sample-family.mjs > sample.sql
import defaults from '../src/config.default.js';
import { ymd, addDaysYmd, parts } from '../src/lib/ical.js';
import * as P from '../src/lib/points.js';

const HID = 1;
const cfg = structuredClone(defaults);
cfg.family.name = 'Test family';
cfg.kids[0].name = 'Ava'; cfg.kids[1].name = 'Lily';
cfg.setup = { done: true };
const zone = cfg.zone;
const today = ymd(new Date(), zone);
// Pay day is the day this runs, and the week has already closed, so the pay day screen shows straight away
// and the whole week is on the chart.
cfg.week = { ...cfg.week, payDay: parts(new Date(), zone).wd, closesAt: '00:00' };
const wk = P.payWeekStart(today, cfg);
const midWeek = addDaysYmd(wk, 3); // the extra chore starts on the week's fourth day
const before = structuredClone(cfg);
const after = structuredClone(cfg);
after.tasks.push({ id: 't13', title: 'Feed the dog', emoji: '🐶', who: 'both', when: 'after', days: [0, 1, 2, 3, 4, 5, 6], stars: 1 });

// Which chores each kid skipped, by day of the week (0 = Monday) and position in that day's list.
const skip = { kid1: { 2: [1, 4] }, kid2: { 0: [0, 3], 2: [1, 2, 5], 3: [0, 2, 4] } };
const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const now = new Date().toISOString();
const sql = [];
for (const t of ['checks', 'day_plans', 'quest_claims', 'ledger', 'todos', 'cash_requests']) sql.push(`DELETE FROM ${t} WHERE household_id=${HID};`);
sql.push(`DELETE FROM settings WHERE household_id=${HID} AND key IN ('config','weekbar','paychecks','payday');`);
sql.push(`INSERT INTO ledger(household_id,week,kid,kind,amount,stars,note,created_at) VALUES(${HID},${q(addDaysYmd(wk, -7))},'kid2','jar',4,0,'to savings jar',${q(now)});`);
sql.push(`INSERT INTO settings(household_id,key,value,updated_at) VALUES(${HID},'config',${q(JSON.stringify(after))},${q(now)});`);

// The week's bar is what the week looked like on Monday, before the extra chore.
const bars = {};
for (const k of before.kids) bars[k.id] = P.weekSummary(k, wk, before, [], [], [], wk, {}).possible;
sql.push(`INSERT INTO settings(household_id,key,value,updated_at) VALUES(${HID},'weekbar',${q(JSON.stringify({ week: wk, kids: bars }))},${q(now)});`);

for (let i = 0; i < 7; i++) {
  const d = addDaysYmd(wk, i); if (d > today) break;
  const plan = P.instancesForDay(d, d < midWeek ? before : after, []);
  if (d < today) sql.push(`INSERT INTO day_plans(household_id,date,plan,updated_at) VALUES(${HID},${q(d)},${q(JSON.stringify(plan))},${q(now)});`);
  for (const k of cfg.kids) {
    const mine = plan.filter((inst) => P.ownersOf(inst).includes(k.id));
    mine.forEach((inst, n) => {
      if (d === today && (inst.when !== 'morning' || (k.id === 'kid2' && n > 0))) return; // today: only the morning so far
      if ((skip[k.id][i] || []).includes(n)) return;
      sql.push(`INSERT INTO checks(household_id,date,kid,task,points,kind,done_at,by) VALUES(${HID},${q(d)},${q(k.id)},${q(inst.id)},${inst.stars},${q(inst.kind || 'chore')},${q(now)},'sample');`);
    });
  }
}
console.log(sql.join('\n'));
