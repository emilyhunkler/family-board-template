// Saving settings from one screen without undoing changes made somewhere else in the meantime.
// base: the config as that screen loaded it (or last saved it). next: what that screen wants to save.
// current: the config as it is saved now. Only the parts the screen actually changed are taken from it;
// everything else (the other grown-up's edits, °F/°C, kids finishing their avatars) stays as it is now.
// Plain objects are compared key by key; lists and single values are taken whole.
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function mergeChanges(current, base, next) {
  if (!isObj(next) || !isObj(base) || !isObj(current)) return same(base, next) ? current : next;
  const out = { ...current };
  for (const k of new Set([...Object.keys(base), ...Object.keys(next)])) {
    if (same(base[k], next[k])) continue;
    if (!(k in next)) { delete out[k]; continue; }
    out[k] = isObj(base[k]) && isObj(next[k]) && isObj(current[k]) ? mergeChanges(current[k], base[k], next[k]) : next[k];
  }
  return out;
}
