// The calendar is the costliest thing the board works out, and Cloudflare's free plan stops any request that
// uses more than 10 ms of processor time. These tests keep the calendar both right and cheap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// Count every time-zone lookup the calendar code asks of Intl (the slow part), before the code loads.
let intlCalls = 0;
const realParts = Intl.DateTimeFormat.prototype.formatToParts;
Intl.DateTimeFormat.prototype.formatToParts = function (...a) { intlCalls++; return realParts.apply(this, a); };
const { parseICS, expandEvents, parts, zoned, ymd } = await import('../src/lib/ical.js');

const Z = 'America/New_York';
const cal = (...events) => ['BEGIN:VCALENDAR', ...events.flatMap((e) => ['BEGIN:VEVENT', ...e, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');
const win = (from, to, zone = Z) => [zoned(...from, 0, 0, 0, zone), zoned(...to, 0, 0, 0, zone)];
const expand = (text, from, to, zone = Z) => { const [f, t] = win(from, to, zone); return expandEvents(parseICS(text, zone, { from: f, to: t }), f, t, zone, {}); };
const intl = (date, tz) => { const p = {}; for (const x of realParts.call(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' }), date)) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) }; };

test('wall-clock times match Intl exactly, including the nights the clocks change', () => {
  const zones = ['America/New_York', 'America/Los_Angeles', 'Europe/London', 'Australia/Lord_Howe', 'Asia/Kolkata', 'Pacific/Auckland', 'America/Sao_Paulo', 'UTC'];
  for (const tz of zones) {
    // every 43 minutes through the months with a clock change somewhere, plus a couple of older years
    for (const [y, m] of [[2026, 3], [2026, 4], [2026, 9], [2026, 10], [2026, 11], [2005, 10]]) {
      for (let t = Date.UTC(y, m - 1, 1); t < Date.UTC(y, m, 1); t += 43 * 60000) {
        const d = new Date(t + 1234); assert.deepEqual(parts(d, tz), intl(d, tz), `${tz} ${d.toISOString()}`);
      }
    }
    // and back again: a wall-clock time turns into the instant Intl agrees with
    for (let day = 1; day <= 31; day++) for (const h of [0, 1, 2, 3, 12, 23]) {
      const t = zoned(2026, 3, day, h, 30, 0, tz); const p = intl(t, tz);
      if (p.d === day && p.h === h) assert.equal(p.mi, 30); // (a time skipped by the clock change has no exact match)
    }
  }
});

test('a daily event that started years ago still shows (it used to vanish after 5,000 days)', () => {
  const text = cal(['UID:dog', 'SUMMARY:Feed the dog', 'DTSTART;TZID=America/New_York:20090105T070000', 'DTEND;TZID=America/New_York:20090105T071500', 'RRULE:FREQ=DAILY']);
  const evs = expand(text, [2026, 11, 13], [2027, 1, 21]);
  assert.equal(evs.length, 69);
  assert.equal(evs[0].start, '2026-11-13T12:00:00.000Z'); // 7 AM in New York, standard time
});

test('repeats land on the right days: skipped dates, moved ones, counts, end dates, every-other weeks', () => {
  const text = cal(
    ['UID:count', 'SUMMARY:Ten-week class', 'DTSTART;TZID=America/New_York:20260901T090000', 'DTEND;TZID=America/New_York:20260901T100000', 'RRULE:FREQ=WEEKLY;COUNT=14;BYDAY=TU'],
    ['UID:swim', 'SUMMARY:Swim', 'DTSTART;TZID=America/New_York:20150106T173000', 'DTEND;TZID=America/New_York:20150106T183000', 'RRULE:FREQ=WEEKLY;BYDAY=TU,TH', 'EXDATE;TZID=America/New_York:20261119T173000'],
    ['UID:swim', 'SUMMARY:Swim (moved)', 'RECURRENCE-ID;TZID=America/New_York:20261124T173000', 'DTSTART;TZID=America/New_York:20261125T173000', 'DTEND;TZID=America/New_York:20261125T183000'],
    ['UID:club', 'SUMMARY:Book club', 'DTSTART;TZID=America/New_York:20180103T190000', 'DTEND;TZID=America/New_York:20180103T200000', 'RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20261231T000000Z'],
    ['UID:pto', 'SUMMARY:PTO meeting', 'DTSTART;TZID=America/New_York:20120110T183000', 'DTEND;TZID=America/New_York:20120110T193000', 'RRULE:FREQ=MONTHLY;BYDAY=2TU'],
    ['UID:turkey', 'SUMMARY:Thanksgiving', 'DTSTART;VALUE=DATE:19991125', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=4TH'],
    ['UID:trip', 'SUMMARY:Long trip', 'DTSTART;VALUE=DATE:20261001', 'DTEND;VALUE=DATE:20261116'],
    ['UID:gone', 'SUMMARY:Long ago', 'DTSTART:20150301T150000Z', 'DTEND:20150301T160000Z'],
  );
  const evs = expand(text, [2026, 11, 13], [2027, 1, 21]);
  const days = (title) => evs.filter((e) => e.title === title).map((e) => ymd(new Date(e.start), Z));
  assert.deepEqual(days('Ten-week class'), ['2026-11-17', '2026-11-24', '2026-12-01']); // the 14th is Dec 1
  assert.ok(!days('Swim').includes('2026-11-19') && !days('Swim').includes('2026-11-24')); // skipped, and moved
  assert.deepEqual(days('Swim (moved)'), ['2026-11-25']);
  assert.equal(days('Swim').length, 19 - 2); // every Tuesday and Thursday in the window, less those two
  assert.deepEqual(days('Book club'), ['2026-11-25', '2026-12-09', '2026-12-23']); // even weeks since Jan 3, 2018; ends before the 30th
  assert.deepEqual(days('PTO meeting'), ['2026-12-08', '2027-01-12']);
  assert.deepEqual(days('Thanksgiving'), ['2026-11-26']);
  assert.deepEqual(days('Long trip'), ['2026-10-01']); // began before the window, still on until the 15th
  assert.deepEqual(days('Long ago'), []);
});

test('working out a calendar with years of history asks Intl only a little', () => {
  // Ten years of weekly, daily and monthly repeats, and 1,500 one-off events from 2014 on.
  const evs = [];
  for (let i = 0; i < 20; i++) evs.push([`UID:w${i}`, 'SUMMARY:Practice', `DTSTART;TZID=America/New_York:2016${String(1 + (i % 12)).padStart(2, '0')}0${1 + (i % 9)}T1${i % 10}0000`, `DTEND;TZID=America/New_York:2016${String(1 + (i % 12)).padStart(2, '0')}0${1 + (i % 9)}T1${i % 10}3000`, i % 5 === 0 ? 'RRULE:FREQ=DAILY' : i % 5 === 1 ? 'RRULE:FREQ=MONTHLY' : 'RRULE:FREQ=WEEKLY']);
  for (let i = 0; i < 1500; i++) { const d = new Date(Date.UTC(2014, 0, 1) + i * 3.3 * 86400000).toISOString().slice(0, 10).replace(/-/g, ''); evs.push([`UID:o${i}`, 'SUMMARY:Thing', 'DTSTAMP:20261120T120000Z', `DTSTART;TZID=America/New_York:${d}T090000`, `DTEND;TZID=America/New_York:${d}T100000`]); }
  const text = cal(...evs);
  intlCalls = 0; const out = expand(text, [2026, 11, 13], [2027, 1, 21]);
  assert.ok(out.length > 300, `${out.length} events`);
  // The old code asked Intl about 40,000 times here; each ask is a few microseconds of the 10 ms budget.
  assert.ok(intlCalls < 400, `${intlCalls} Intl calls`);
});

function fakeD1(db) {
  return { prepare(sql) { const st = db.prepare(sql); let args = []; const o = {
    bind(...a) { args = a; return o; },
    async first(col) { const r = st.get(...args); return r ? (col ? r[col] : { ...r }) : null; },
    async all() { return { results: st.all(...args).map((r) => ({ ...r })) }; },
    async run() { const r = st.run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; } }; return o; } };
}

test('the 15-minute job only works out a calendar again when the calendar changed', async (t) => {
  const db = new DatabaseSync(':memory:'); const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const defaults = (await import('../src/config.default.js')).default; const cfg = structuredClone(defaults);
  cfg.calendars = [{ ...cfg.calendars[0], url: 'https://calendar.test/family.ics', enabled: true }];
  db.prepare("INSERT INTO settings(key,value,updated_at,household_id) VALUES('config',?,?,1)").run(JSON.stringify(cfg), new Date().toISOString());
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const feed = (title, stamp) => cal(['UID:a', `DTSTAMP:${stamp}`, `SUMMARY:${title}`, `DTSTART:${today}T170000Z`, `DTEND:${today}T180000Z`, 'RRULE:FREQ=DAILY']);
  let text = feed('Soccer', '20261120T100000Z'); let downloads = 0;
  const realFetch = globalThis.fetch; globalThis.fetch = async (u) => { if (String(u).startsWith('https://calendar.test/')) { downloads++; return new Response(text); } throw new Error('no network in tests'); };
  t.after(() => { globalThis.fetch = realFetch; });
  const { default: worker } = await import('../src/worker.js');
  const env = { DB: fakeD1(db), ASSETS: { fetch: async () => new Response('') }, LOCAL_DEV: '1' };
  const job = async () => { const p = []; await worker.scheduled({}, env, { waitUntil: (x) => p.push(x) }); await Promise.all(p); };
  const saved = () => db.prepare("SELECT value, fetched_at FROM cache WHERE key LIKE 'cal:%' AND household_id=1").get();
  const board = async () => (await (await worker.fetch(new Request('http://localhost/api/board'), env, { waitUntil() {} })).json()).events;

  await job(); const first = saved(); assert.ok(first.value.includes('Soccer'));
  // Same feed, only the download time stamp is new (Google changes it on every download): nothing is worked out again.
  intlCalls = 0; text = feed('Soccer', '20261120T101500Z'); await job();
  assert.equal(saved().value, first.value); assert.ok(saved().fetched_at >= first.fetched_at);
  assert.ok(intlCalls < 20, `${intlCalls} Intl calls on an unchanged feed`);
  // A screen loading the board reads the saved copy and doesn't download anything.
  const before = downloads; const evs = await board(); assert.equal(downloads, before); assert.ok(evs.some((e) => e.title === 'Soccer'));
  // A real change comes through on the next run.
  text = feed('Soccer at the park', '20261120T103000Z'); await job();
  assert.ok(saved().value.includes('Soccer at the park'));
  assert.ok((await board()).some((e) => e.title === 'Soccer at the park'));
});
