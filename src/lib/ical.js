// Minimal iCalendar parser and recurrence expander (Google Calendar export).
// DTSTART/DTEND in UTC, TZID or all-day; RRULE DAILY/WEEKLY/MONTHLY/YEARLY with
// INTERVAL/COUNT/UNTIL/BYDAY/BYMONTHDAY/BYMONTH/BYSETPOS/WKST; EXDATE; RECURRENCE-ID; STATUS.
// All wall-clock math happens in one zone (the family's), passed in as `zone`.

// Turning an instant into wall-clock time asks Intl, which is slow (a few microseconds a call) and the
// board does it thousands of times. So we ask Intl only for a zone's UTC offset at the start and end of
// each 8-day stretch (then each day), and keep the answer: if the two ends agree, the offset holds for the
// whole stretch. Only the two days a year when the clocks change go back to asking Intl for the exact instant.
const fmtCache = {};
function dtf(tz) {
  return fmtCache[tz] || (fmtCache[tz] = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
  }));
}
function intlParts(t, tz) {
  const p = {};
  for (const x of dtf(tz).formatToParts(new Date(t))) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}
// offset (local minus UTC, in ms) at a whole-second instant, straight from Intl
function intlOffset(tz, t) { const p = intlParts(t, tz); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - t; }
const DAY = 86400000; const BLOCK = 8 * DAY; const offCache = new Map(); let offCount = 0;
// offset if it's the same at both ends of the span [a, a + len), else null
function steady(tz, a, len) {
  let m = offCache.get(tz); if (!m) offCache.set(tz, m = new Map()); const k = len === DAY ? -a : a; let off = m.get(k);
  if (off === undefined) {
    const x = intlOffset(tz, a), y = intlOffset(tz, a + len - 1000); off = x === y ? x : null;
    if (++offCount > 20000) { offCache.clear(); offCount = 0; m = new Map(); offCache.set(tz, m); } m.set(k, off);
  }
  return off;
}
function offsetAt(tz, t) {
  t = Math.floor(t / 1000) * 1000;
  let off = steady(tz, Math.floor(t / BLOCK) * BLOCK, BLOCK); if (off !== null) return off;
  off = steady(tz, Math.floor(t / DAY) * DAY, DAY); return off !== null ? off : intlOffset(tz, t);
}
// wall-clock parts of an instant in a zone
export function parts(date, tz) {
  const t = date.getTime(); const l = new Date(t + offsetAt(tz, t));
  return { y: l.getUTCFullYear(), m: l.getUTCMonth() + 1, d: l.getUTCDate(), h: l.getUTCHours(), mi: l.getUTCMinutes(), s: l.getUTCSeconds(), wd: l.getUTCDay() };
}
// instant for a wall-clock time in a zone
export function zoned(y, m, d, h, mi, s, tz) {
  const guess = Date.UTC(y, m - 1, d, h || 0, mi || 0, s || 0);
  try {
    const off = offsetAt(tz, guess); let t = guess - off;
    const off2 = offsetAt(tz, t); if (off2 !== off) t = guess - off2;
    return new Date(t);
  } catch { return new Date(guess); }
}
export function ymd(date, tz) { const p = parts(date, tz); return `${p.y}-${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')}`; }
export function addDaysYmd(s, n) { const [y,m,d] = s.split('-').map(Number); const t = new Date(Date.UTC(y, m-1, d + n)); return t.toISOString().slice(0,10); }
export function weekdayOfYmd(s) { const [y,m,d] = s.split('-').map(Number); return new Date(Date.UTC(y, m-1, d)).getUTCDay(); }

function parseDateValue(value, params, zone) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (m[4] === undefined || (params.VALUE || '').toUpperCase() === 'DATE') return { date: zoned(y, mo, d, 0, 0, 0, zone), allDay: true, ymd: `${m[1]}-${m[2]}-${m[3]}` };
  const h = +m[4], mi = +m[5], s = +(m[6] || 0);
  if (m[7] === 'Z') return { date: new Date(Date.UTC(y, mo - 1, d, h, mi, s)), allDay: false };
  return { date: zoned(y, mo, d, h, mi, s, params.TZID || zone), allDay: false };
}
const unfold = (t) => t.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
function parseLine(line) {
  const i = line.indexOf(':'); if (i < 0) return null;
  const bits = line.slice(0, i).split(';'); const params = {};
  for (let k = 1; k < bits.length; k++) { const e = bits[k].indexOf('='); if (e > 0) params[bits[k].slice(0, e).toUpperCase()] = bits[k].slice(e + 1).replace(/^"|"$/g, ''); }
  return { name: bits[0].toUpperCase(), params, value: line.slice(i + 1) };
}
const unesc = (s) => s.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\;/g, ';').replace(/\\\\/g, '\\');
const DAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
function parseRRule(v, zone) {
  const r = { freq: 'WEEKLY', interval: 1 };
  for (const part of v.split(';')) {
    const [k, val] = part.split('='); if (!val) continue;
    switch (k.toUpperCase()) {
      case 'FREQ': r.freq = val.toUpperCase(); break;
      case 'INTERVAL': r.interval = Math.max(1, parseInt(val, 10) || 1); break;
      case 'COUNT': r.count = parseInt(val, 10); break;
      case 'UNTIL': { const d = parseDateValue(val, {}, zone); if (d) r.until = d.allDay ? new Date(d.date.getTime() + 86399000) : d.date; break; }
      case 'BYDAY': r.byday = val.split(',').map((s) => { const m = /^([+-]?\d+)?([A-Z]{2})$/.exec(s.toUpperCase()); return m ? { ord: m[1] ? parseInt(m[1], 10) : 0, day: DAYS[m[2]] } : null; }).filter(Boolean); break;
      case 'BYMONTHDAY': r.bymonthday = val.split(',').map(Number); break;
      case 'BYMONTH': r.bymonth = val.split(',').map(Number); break;
      case 'BYSETPOS': r.bysetpos = val.split(',').map(Number); break;
      case 'WKST': r.wkst = DAYS[val.toUpperCase()] ?? 1; break;
    }
  }
  return r;
}
// With `range` ({ from, to }), events that clearly fall outside it are dropped before any time-zone math,
// which is most of a calendar that holds years of history. "Clearly" leaves two days' room on each side.
const USED = new Set(['BEGIN', 'END', 'UID', 'SUMMARY', 'LOCATION', 'DESCRIPTION', 'STATUS', 'DTSTART', 'DTEND', 'DURATION', 'RRULE', 'RECURRENCE-ID', 'EXDATE']);
const rawDay = (v) => (/^\d{8}/.exec(v.trim()) || [''])[0];
export function parseICS(text, zone, range) {
  const events = []; let cur = null, depth = 0;
  const pad = (d, n) => new Date(d.getTime() + n * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
  const lo = range ? pad(range.from, -2) : '', hi = range ? pad(range.to, 2) : '';
  const inside = (a, b) => !range || (a && a <= hi && (b || a) >= lo);
  const finish = (c) => {
    if (!c.dtstart) return; const sDay = rawDay(c.dtstart.value);
    if (c.rrule) { c.rrule = parseRRule(c.rrule, zone); if (range && c.rrule.until && c.rrule.until < range.from) return; }
    else if (c.rid) { if (!inside(sDay, c.dtend ? rawDay(c.dtend.value) : '') && !inside(rawDay(c.rid.value))) return; }
    else {
      let eDay = c.dtend ? rawDay(c.dtend.value) : '';
      if (!c.dtend && c.durationRaw) eDay = pad(new Date(Date.UTC(+sDay.slice(0, 4), +sDay.slice(4, 6) - 1, +sDay.slice(6, 8)) + Math.max(0, parseDuration(c.durationRaw))), 1);
      if (!inside(sDay, eDay)) return;
    }
    const ev = { exdates: [], status: c.status || 'CONFIRMED', uid: c.uid, rrule: c.rrule };
    if (c.summary !== undefined) ev.summary = unesc(c.summary); if (c.location !== undefined) ev.location = unesc(c.location); if (c.description !== undefined) ev.description = unesc(c.description);
    ev.start = parseDateValue(c.dtstart.value, c.dtstart.params, zone); if (!ev.start) return;
    if (c.dtend) ev.end = parseDateValue(c.dtend.value, c.dtend.params, zone); if (c.durationRaw) ev.duration = parseDuration(c.durationRaw);
    if (c.rid) ev.recurrenceId = parseDateValue(c.rid.value, c.rid.params, zone);
    for (const x of c.exdates) for (const v of x.value.split(',')) { if (range && !inside(rawDay(v))) continue; const d = parseDateValue(v, x.params, zone); if (d) ev.exdates.push(d); }
    if (!ev.rrule) delete ev.rrule; if (!ev.recurrenceId) delete ev.recurrenceId; events.push(ev);
  };
  for (const raw of unfold(text).split('\n')) {
    if (!raw) continue;
    // Look at the property name first, and skip lines the board never uses (DTSTAMP, ATTENDEE, ...).
    const c = raw.indexOf(':'), sc = raw.indexOf(';'); const nm = raw.slice(0, sc >= 0 && sc < c ? sc : c).toUpperCase(); if (c < 0 || !USED.has(nm)) continue;
    const l = parseLine(raw); if (!l) continue;
    if (l.name === 'BEGIN') { if (l.value === 'VEVENT') { cur = { exdates: [] }; depth = 0; } else if (cur) depth++; continue; }
    if (l.name === 'END') { if (l.value === 'VEVENT' && cur) { finish(cur); cur = null; } else if (cur && depth > 0) depth--; continue; }
    if (!cur || depth > 0) continue;
    switch (l.name) {
      case 'UID': cur.uid = l.value; break;
      case 'SUMMARY': cur.summary = l.value; break;
      case 'LOCATION': cur.location = l.value; break;
      case 'DESCRIPTION': cur.description = l.value; break;
      case 'STATUS': cur.status = l.value.toUpperCase(); break;
      case 'DTSTART': cur.dtstart = l; break;
      case 'DTEND': cur.dtend = l; break;
      case 'DURATION': cur.durationRaw = l.value; break;
      case 'RRULE': cur.rrule = l.value; break;
      case 'RECURRENCE-ID': cur.rid = l; break;
      case 'EXDATE': cur.exdates.push(l); break;
    }
  }
  return events;
}
function parseDuration(v) {
  const m = /^(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v); if (!m) return 0;
  const ms = ((+m[2] || 0) * 604800 + (+m[3] || 0) * 86400 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)) * 1000;
  return m[1] ? -ms : ms;
}
// Generate occurrence starts as wall-clock in `zone`. With `from`, start near that instant instead of at
// DTSTART: a weekly event that began in 2015 skips straight to this month rather than walking ten years of
// Mondays. (Not with COUNT, which needs every earlier occurrence counted.) Each jump stops a step or two
// short, and occurrences before `from` are still yielded, so nothing in the window is ever missed.
function* starts(start, rule, zone, from) {
  const p = parts(start, zone); const at = (y, m, d) => zoned(y, m + 1, d, p.h, p.mi, p.s, zone);
  const wkst = rule.wkst ?? 1; const MAX = 5000; let n = 0;
  const dim = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const dow = (y, m, d) => new Date(Date.UTC(y, m, d)).getUTCDay();
  const iv = rule.interval; const skip = from && !rule.count && from > start;
  // whole intervals that fit before `from`, less `slack` steps, never below 0
  const jump = (steps, slack) => skip ? Math.max(0, Math.floor(steps / iv) - slack) * iv : 0;
  const f = skip ? parts(from, zone) : null; const sDay = Date.UTC(p.y, p.m - 1, p.d) / 86400000;
  if (rule.freq === 'DAILY') { for (let i = jump(f ? Date.UTC(f.y, f.m - 1, f.d) / 86400000 - sDay : 0, 2); n < MAX; i += iv, n++) yield at(p.y, p.m - 1, p.d + i); }
  else if (rule.freq === 'WEEKLY') {
    const days = (rule.byday?.length ? rule.byday.map((b) => b.day) : [p.wd]).sort((a, b) => ((a - wkst + 7) % 7) - ((b - wkst + 7) % 7));
    const back = (p.wd - wkst + 7) % 7; const base = Date.UTC(p.y, p.m - 1, p.d - back);
    for (let w = jump(f ? Math.floor((Date.UTC(f.y, f.m - 1, f.d) - base) / 604800000) : 0, 1); n < MAX; w += iv) for (const d of days) {
      const t = new Date(base + (w * 7 + (d - wkst + 7) % 7) * 86400000); const c = at(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
      if (c >= start) { yield c; n++; }
    }
  } else if (rule.freq === 'MONTHLY') {
    for (let k = jump(f ? (f.y - p.y) * 12 + (f.m - p.m) : 0, 1); n < MAX; k += iv) {
      const t = new Date(Date.UTC(p.y, p.m - 1 + k, 1)); const y = t.getUTCFullYear(), m = t.getUTCMonth(), days = dim(y, m); let cands = [];
      if (rule.byday?.length) for (const b of rule.byday) { const ms = []; for (let d = 1; d <= days; d++) if (dow(y, m, d) === b.day) ms.push(d); const pick = b.ord > 0 ? [ms[b.ord - 1]] : b.ord < 0 ? [ms[ms.length + b.ord]] : ms; for (const d of pick) if (d) cands.push(d); }
      else if (rule.bymonthday?.length) for (const md of rule.bymonthday) { const d = md > 0 ? md : days + md + 1; if (d >= 1 && d <= days) cands.push(d); }
      else if (p.d <= days) cands.push(p.d);
      cands.sort((a, b) => a - b); if (rule.bysetpos?.length) cands = rule.bysetpos.map((x) => x > 0 ? cands[x - 1] : cands[cands.length + x]).filter(Boolean);
      for (const d of cands) { const c = at(y, m, d); if (c >= start) { yield c; n++; } }
    }
  } else if (rule.freq === 'YEARLY') {
    for (let k = jump(f ? f.y - p.y : 0, 1); n < MAX; k += iv) {
      const y = p.y + k; const months = rule.bymonth?.length ? rule.bymonth.map((x) => x - 1) : [p.m - 1];
      for (const m of months) {
        if (rule.byday?.length) { const days = dim(y, m); for (const b of rule.byday) { const ms = []; for (let d = 1; d <= days; d++) if (dow(y, m, d) === b.day) ms.push(d); const pick = b.ord > 0 ? [ms[b.ord - 1]] : b.ord < 0 ? [ms[ms.length + b.ord]] : ms; for (const d of pick) if (d) { const c = at(y, m, d); if (c >= start) { yield c; n++; } } } }
        else if (p.d <= dim(y, m)) { const c = at(y, m, p.d); if (c >= start) { yield c; n++; } }
      }
    }
  } else yield start;
}
const key = (d, allDay, zone) => allDay ? ymd(d, zone) : String(d.getTime());
export function expandEvents(events, rangeStart, rangeEnd, zone, meta = {}) {
  const byUid = new Map();
  for (const ev of events) { const uid = ev.uid || Math.random().toString(36).slice(2); if (!byUid.has(uid)) byUid.set(uid, { master: null, overrides: [] }); if (ev.recurrenceId) byUid.get(uid).overrides.push(ev); else byUid.get(uid).master = ev; }
  const out = [];
  const dur = (ev) => ev.end ? ev.end.date - ev.start.date : ev.duration ? ev.duration : ev.start.allDay ? 86400000 : 0;
  const push = (ev, s, e, id) => { if (ev.status === 'CANCELLED' || e <= rangeStart || s >= rangeEnd) return; out.push({ id, uid: ev.uid, title: ev.summary || '(no title)', location: ev.location || '', description: (ev.description || '').slice(0, 400), start: s.toISOString(), end: e.toISOString(), allDay: !!ev.start.allDay, ...meta }); };
  for (const [uid, g] of byUid) {
    const okeys = new Set(g.overrides.map((o) => key(o.recurrenceId.date, o.recurrenceId.allDay, zone)));
    for (const o of g.overrides) push(o, o.start.date, new Date(o.start.date.getTime() + dur(o)), uid + '_' + key(o.recurrenceId.date, o.recurrenceId.allDay, zone));
    const m = g.master; if (!m) continue; const d = dur(m);
    if (!m.rrule) { push(m, m.start.date, new Date(m.start.date.getTime() + d), uid); continue; }
    if (m.rrule.until && m.rrule.until < rangeStart - d) continue; // ended before the window
    const ex = new Set(m.exdates.map((e) => key(e.date, e.allDay, zone))); let count = 0;
    // An occurrence that starts up to one event-length before the window still shows (it runs into it).
    for (const s of starts(m.start.date, m.rrule, zone, new Date(rangeStart.getTime() - d))) {
      count++; if (m.rrule.count && count > m.rrule.count) break; if (m.rrule.until && s > m.rrule.until) break; if (s >= rangeEnd) break;
      const k = key(s, m.start.allDay, zone); if (ex.has(k) || okeys.has(k)) continue;
      push(m, s, new Date(s.getTime() + d), uid + '_' + k);
    }
  }
  out.sort((a, b) => a.start.localeCompare(b.start) || (a.allDay ? -1 : 1));
  return out;
}
