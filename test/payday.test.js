import test from 'node:test';
import assert from 'node:assert/strict';
import { payWeekStart, payDayOf, weekSummary } from '../src/lib/points.js';
import DEFAULT_CONFIG from '../src/config.default.js';

test('the allowance week ends on pay day', () => {
  const cfg = structuredClone(DEFAULT_CONFIG); cfg.week.payDay = 5; // Friday
  assert.equal(payWeekStart('2026-11-18', cfg), '2026-11-14'); // Wednesday -> the Saturday before
  assert.equal(payWeekStart('2026-11-20', cfg), '2026-11-14'); // pay day itself is the last day
  assert.equal(payWeekStart('2026-11-21', cfg), '2026-11-21'); // Saturday starts a new week
  delete cfg.week.payDay; cfg.week.startsOn = 1; assert.equal(payDayOf(cfg), 0); // older boards: Sunday, as before
});

test('days before the start date are not misses', () => {
  const cfg = structuredClone(DEFAULT_CONFIG); cfg.week.payDay = 5; cfg.week.startedOn = '2026-11-17';
  const kid = cfg.kids[0]; const w = weekSummary(kid, '2026-11-14', cfg, [], [], [], '2026-11-17');
  assert.deepEqual(w.days.slice(0, 3).map((d) => d.status), ['free', 'free', 'free']);
  assert.equal(w.misses, 0);
});
