import test from 'node:test';
import assert from 'node:assert/strict';
import { instancesForDay } from '../src/lib/points.js';
import DEFAULT_CONFIG from '../src/config.default.js';

test('take-turns tasks are split between the kids each day and swap the next day', () => {
  const who = (ymd) => instancesForDay(ymd, DEFAULT_CONFIG).filter((x) => x.turn).map((x) => x.kids[0]);
  for (const ymd of ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-22']) {
    const a = who(ymd);
    assert.ok(a.length >= 2, ymd);
    assert.equal(new Set(a).size, 2, `${ymd}: ${a}`);
  }
  assert.notDeepEqual(who('2026-11-18'), who('2026-11-19'));
});
