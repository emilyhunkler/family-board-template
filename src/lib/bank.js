// Kids' bank: on pay day each kid picks "Cash please" or "Bank it", and any time after that they can ask for
// cash from their bank. Money in and out lives in the ledger: 'jar' rows put money in (so a savings jar a kid
// already had is their opening balance) and 'cashout' rows take it out once a grown-up hands the cash over.
// Pure functions; dates are 'YYYY-MM-DD' strings.
import { addDaysYmd } from './ical.js';

export const cents = (n) => Math.round((Number(n) || 0) * 100) / 100;
const hm = (s) => { const [h, m] = String(s || '18:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

// The week closes at closesAt on pay day. On a look at another date (not live) pay day counts as closed all day.
export function payDayClosed(today, payDay, nowParts, closesAt, live = true) {
  if (today !== payDay) return false;
  return !live || nowParts.h * 60 + nowParts.mi >= hm(closesAt);
}

// rows: ledger rows (or per-kind sums) with kid, kind, amount. requests: cash_requests rows.
export function bankOf(kidId, rows, requests = []) {
  let inn = 0, out = 0;
  for (const r of rows) if (r.kid === kidId) { if (r.kind === 'jar') inn += Number(r.amount) || 0; else if (r.kind === 'cashout') out += Number(r.amount) || 0; }
  const balance = cents(inn - out);
  const pending = cents(requests.filter((r) => r.kid === kidId && r.status === 'pending').reduce((s, r) => s + (Number(r.amount) || 0), 0));
  return { balance, pending, available: cents(Math.max(0, balance - pending)) };
}

// Saved pay day totals, so a kid who doesn't collect on the night can still do it in the days after.
// snaps: { weekStart: { at, kids: { kidId: { total, base, bonus } } } }. Keeps the last few weeks.
export const KEEP_WEEKS = 6;
export function withSnapshot(snaps, wk, kids, at) {
  const next = { ...(snaps || {}) }; next[wk] = { at, kids };
  for (const w of Object.keys(next).sort().slice(0, -KEEP_WEEKS)) delete next[w];
  return next;
}

// What a kid has waiting to collect, oldest first: weeks that closed earlier and weren't paid, then this week if
// pay day has closed. paidWeeks: the weeks this kid already has a payout for.
export function dueFor(kidId, { wk, closed, week, snaps, paidWeeks }) {
  const out = [];
  for (const w of Object.keys(snaps || {}).sort()) {
    const s = snaps[w]?.kids?.[kidId]; if (w >= wk || !s || !(s.total > 0) || paidWeeks.has(w)) continue;
    out.push({ week: w, payDay: addDaysYmd(w, 6), total: cents(s.total), base: cents(s.base), bonus: cents(s.bonus) });
  }
  if (closed && week && week.total > 0 && !paidWeeks.has(wk)) out.push({ week: wk, payDay: addDaysYmd(wk, 6), total: cents(week.total), base: cents(week.base), bonus: cents(week.bonusDollars) });
  return out;
}

// Money in and out for one kid, newest first, for the history list.
export function historyOf(kidId, rows, limit = 15) {
  return rows.filter((r) => r.kid === kidId && (r.kind === 'jar' || r.kind === 'cashout') && Number(r.amount))
    .slice(0, limit).map((r) => ({ at: r.created_at, dir: r.kind === 'jar' ? 'in' : 'out', amount: cents(r.amount), note: r.note || '' }));
}
