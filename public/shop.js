// What happens when a kid taps a wardrobe item: wear it, buy it, or hear plainly why not yet. No imports, so the
// tests can run it in Node.
//   have    already theirs (or free): wear it
//   buy     enough stars: ask "Big bow costs 6 stars" on the board itself (iPads in kiosk mode can swallow the browser's own
//           yes/no box, which made buying look broken)
//   short   not enough stars yet: `need` says how many more
//   level   needs a higher level first
//   prize   only comes with a weekly prize
export function shopState(it, kid) {
  const owned = new Set(kid?.wardrobe?.owned || []);
  if ((it.cost === 0 && !it.minLevel && !it.prizeOnly) || owned.has(it.id)) return { status: 'have' };
  if (it.prizeOnly) return { status: 'prize' };
  if (it.minLevel && (kid?.level?.level || 0) < it.minLevel) return { status: 'level' };
  const balance = kid?.wardrobe?.balance || 0;
  if (balance < it.cost) return { status: 'short', need: it.cost - balance };
  return { status: 'buy', left: balance - it.cost };
}

const stars = (n) => `${n} star${n === 1 ? '' : 's'}`;
// The words on the wardrobe card, short enough for a 7-year-old.
export function shopWords(it, kid) {
  const s = shopState(it, kid); const bal = kid?.wardrobe?.balance || 0; const name = kid?.name || 'You';
  // Just the facts, not a shopping push: what it costs and what's there, and keeping saving is a fine answer too.
  if (s.status === 'buy') return { title: `${it.label} costs ${stars(it.cost)}`, text: `${name} has ★ ${bal}.`, yes: 'Get it', no: 'Keep saving' };
  if (s.status === 'short') return { title: `${stars(s.need)} to go!`, text: `${it.label} costs ★ ${it.cost}. ${name} has ★ ${bal}. Do a job or a quest to earn ${s.need === 1 ? 'one more' : 'a few more'}!` };
  if (s.status === 'level') return { title: `Reach level ${it.minLevel}`, text: `${it.label} unlocks at level ${it.minLevel}. Keep earning stars!` };
  if (s.status === 'prize') return { title: 'A prize item', text: `${it.label} comes with a weekly prize.` };
  return { title: it.label, text: '' };
}
