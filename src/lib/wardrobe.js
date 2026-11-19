import defaults, { WARDROBE_V2_FREE } from '../config.default.js';

// New wardrobe items reach boards saved earlier, in the default order. Prices and labels a parent changed are kept.
export function upgradeWardrobe(c) {
  const w = c.wardrobe = c.wardrobe || { catalog: [] }; if (!Array.isArray(w.catalog)) w.catalog = [];
  const mine = new Map(w.catalog.map((i) => [i.id, i])); const known = new Set(defaults.wardrobe.catalog.map((i) => i.id));
  const missing = defaults.wardrobe.catalog.some((i) => !mine.has(i.id)); const old = (w.v || 1) < 2;
  if (!missing && !old) return false;
  w.catalog = [...defaults.wardrobe.catalog.map((i) => mine.get(i.id) || structuredClone(i)), ...w.catalog.filter((i) => !known.has(i.id))];
  if (old) { for (const it of w.catalog) if (WARDROBE_V2_FREE[it.id] !== undefined && it.cost === WARDROBE_V2_FREE[it.id]) it.cost = 0; w.v = 2; }
  return true;
}
