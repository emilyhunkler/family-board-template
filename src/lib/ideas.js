// The family idea of the day, as the board keeps it: which idea today is on ("Another idea" moves it along),
// whether the family did it, and a short list of ideas done lately so the same one doesn't come back too soon.
// The idea itself is picked on each screen (public/ideas.js), so the Worker does no extra work per board load.
export const KEEP = 30;
export function ideaState(saved, today) {
  const log = Array.isArray(saved?.log) ? saved.log.slice(0, KEEP) : [];
  if (saved?.date === today) return { date: today, skip: Math.max(0, saved.skip | 0), done: saved.done || null, log };
  return { date: today, skip: 0, done: null, log };
}
const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
// Returns the new state, or an error message. "done" is once a day; "next" stops once today's idea is done.
export function ideaStep(state, body, at) {
  const s = { ...state, log: [...state.log] };
  if (body?.action === 'next') { if (s.done) return { error: 'Today’s idea is already done' }; s.skip = Math.min(s.skip + 1, 500); return { state: s }; }
  if (body?.action === 'done') {
    if (s.done) return { state: s, already: true };
    const text = clean(body.text, 160); const id = clean(body.id, 40) || 'idea'; const emoji = clean(body.emoji, 8);
    if (!text) return { error: 'Which idea?' };
    s.done = { id, text, emoji, at };
    s.log = [{ date: s.date, id, text, emoji }, ...s.log.filter((x) => x.date !== s.date)].slice(0, KEEP);
    return { state: s, fresh: true };
  }
  return { error: 'Unknown idea action' };
}
