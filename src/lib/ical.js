// Minimal iCalendar parser and recurrence expander (Google Calendar export).
// DTSTART/DTEND in UTC, TZID or all-day; RRULE DAILY/WEEKLY/MONTHLY/YEARLY with
// INTERVAL/COUNT/UNTIL/BYDAY/BYMONTHDAY/BYMONTH/BYSETPOS/WKST; EXDATE; RECURRENCE-ID; STATUS.
// All wall-clock math happens in one zone (the family's), passed in as `zone`.

const fmtCache = {};
function dtf(tz) {
  return fmtCache[tz] || (fmtCache[tz] = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
  }));
}
// wall-clock parts of an instant in a zone
export function parts(date, tz) {
  const p = {};
  for (const x of dtf(tz).formatToParts(date)) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second, wd: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(p.weekday) };
}
function offsetMs(tz, date) { const p = parts(date, tz); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - date.getTime(); }
// instant for a wall-clock time in a zone
export function zoned(y, m, d, h, mi, s, tz) {
  const guess = Date.UTC(y, m - 1, d, h || 0, mi || 0, s || 0);
  try {
    let off = offsetMs(tz, new Date(guess)); let t = guess - off;
    const off2 = offsetMs(tz, new Date(t)); if (off2 !== off) t = guess - off2;
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
export function parseICS(text, zone) {
  const events = []; let cur = null, depth = 0;
  for (const raw of unfold(text).split('\n')) {
    if (!raw) continue; const l = parseLine(raw); if (!l) continue;
    if (l.name === 'BEGIN') { if (l.value === 'VEVENT') { cur = { exdates: [], status: 'CONFIRMED' }; depth = 0; } else if (cur) depth++; continue; }
    if (l.name === 'END') { if (l.value === 'VEVENT' && cur) { if (cur.start) events.push(cur); cur = null; } else if (cur && depth > 0) depth--; continue; }
    if (!cur || depth > 0) continue;
    switch (l.name) {
      case 'UID': cur.uid = l.value; break;
      case 'SUMMARY': cur.summary = unesc(l.value); break;
      case 'LOCATION': cur.location = unesc(l.value); break;
      case 'DESCRIPTION': cur.description = unesc(l.value); break;
      case 'STATUS': cur.status = l.value.toUpperCase(); break;
      case 'DTSTART': cur.start = parseDateValue(l.value, l.params, zone); break;
      case 'DTEND': cur.end = parseDateValue(l.value, l.params, zone); break;
      case 'DURATION': cur.duration = parseDuration(l.value); break;
      case 'RRULE': cur.rrule = parseRRule(l.value, zone); break;
      case 'RECURRENCE-ID': cur.recurrenceId = parseDateValue(l.value, l.params, zone); break;
      case 'EXDATE': for (const v of l.value.split(',')) { const d = parseDateValue(v, l.params, zone); if (d) cur.exdates.push(d); } break;
    }
  }
  return events;
}
function parseDuration(v) {
  const m = /^(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v); if (!m) return 0;
  const ms = ((+m[2] || 0) * 604800 + (+m[3] || 0) * 86400 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)) * 1000;
  return m[1] ? -ms : ms;
}
// Generate occurrence starts as wall-clock in `zone`
function* starts(start, rule, zone) {
  const p = parts(start, zone); const at = (y, m, d) => zoned(y, m + 1, d, p.h, p.mi, p.s, zone);
  const wkst = rule.wkst ?? 1; const MAX = 5000; let n = 0;
  const dim = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const dow = (y, m, d) => new Date(Date.UTC(y, m, d)).getUTCDay();
  if (rule.freq === 'DAILY') { for (let i = 0; n < MAX; i += rule.interval, n++) yield at(p.y, p.m - 1, p.d + i); }
  else if (rule.freq === 'WEEKLY') {
    const days = (rule.byday?.length ? rule.byday.map((b) => b.day) : [p.wd]).sort((a, b) => ((a - wkst + 7) % 7) - ((b - wkst + 7) % 7));
    const back = (p.wd - wkst + 7) % 7; const base = Date.UTC(p.y, p.m - 1, p.d - back);
    for (let w = 0; n < MAX; w += rule.interval) for (const d of days) {
      const t = new Date(base + (w * 7 + (d - wkst + 7) % 7) * 86400000); const c = at(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
      if (c >= start) { yield c; n++; }
    }
  } else if (rule.freq === 'MONTHLY') {
    for (let k = 0; n < MAX; k += rule.interval) {
      const t = new Date(Date.UTC(p.y, p.m - 1 + k, 1)); const y = t.getUTCFullYear(), m = t.getUTCMonth(), days = dim(y, m); let cands = [];
      if (rule.byday?.length) for (const b of rule.byday) { const ms = []; for (let d = 1; d <= days; d++) if (dow(y, m, d) === b.day) ms.push(d); const pick = b.ord > 0 ? [ms[b.ord - 1]] : b.ord < 0 ? [ms[ms.length + b.ord]] : ms; for (const d of pick) if (d) cands.push(d); }
      else if (rule.bymonthday?.length) for (const md of rule.bymonthday) { const d = md > 0 ? md : days + md + 1; if (d >= 1 && d <= days) cands.push(d); }
      else if (p.d <= days) cands.push(p.d);
      cands.sort((a, b) => a - b); if (rule.bysetpos?.length) cands = rule.bysetpos.map((x) => x > 0 ? cands[x - 1] : cands[cands.length + x]).filter(Boolean);
      for (const d of cands) { const c = at(y, m, d); if (c >= start) { yield c; n++; } }
    }
  } else if (rule.freq === 'YEARLY') {
    for (let k = 0; n < MAX; k += rule.interval) {
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
  const push = (ev, s, e, id) => { if (ev.status === 'CANCELLED' || e <= rangeStart || s >= rangeEnd) return; out.push({ id, uid: ev.uid, title: ev.summary || '(no title)', location: ev.location || '', description: ev.description || '', start: s.toISOString(), end: e.toISOString(), allDay: !!ev.start.allDay, ...meta }); };
  for (const [uid, g] of byUid) {
    const okeys = new Set(g.overrides.map((o) => key(o.recurrenceId.date, o.recurrenceId.allDay, zone)));
    for (const o of g.overrides) push(o, o.start.date, new Date(o.start.date.getTime() + dur(o)), uid + '_' + key(o.recurrenceId.date, o.recurrenceId.allDay, zone));
    const m = g.master; if (!m) continue; const d = dur(m);
    if (!m.rrule) { push(m, m.start.date, new Date(m.start.date.getTime() + d), uid); continue; }
    const ex = new Set(m.exdates.map((e) => key(e.date, e.allDay, zone))); let count = 0;
    for (const s of starts(m.start.date, m.rrule, zone)) {
      count++; if (m.rrule.count && count > m.rrule.count) break; if (m.rrule.until && s > m.rrule.until) break; if (s >= rangeEnd) break;
      const k = key(s, m.start.allDay, zone); if (ex.has(k) || okeys.has(k)) continue;
      push(m, s, new Date(s.getTime() + d), uid + '_' + k);
    }
  }
  out.sort((a, b) => a.start.localeCompare(b.start) || (a.allDay ? -1 : 1));
  return out;
}
