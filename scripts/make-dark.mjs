// Builds public/dark.css from public/style.css: the same rules, with each light color turned into a dark one.
// Run after changing style.css:  node scripts/make-dark.mjs      (npm test fails if dark.css is out of date)
// How: light backgrounds become deep versions of the same hue, dark text becomes light, bright accents
// (sun yellow, kid colors, green buttons) stay as they are and keep dark text on top of them.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const VARS = `html.dark{color-scheme:dark;--ink:#e6ecf5;--ink2:#c3cddc;--muted:#9aa6b8;--card:#1c2433;--soft:#253041;--soft2:#2c3a4e;--line:#34445a;--note:#3a3218;--noteText:#ffe7a3}
html.dark body::before{opacity:.35}
html.dark img.photo,html.dark .photo img{filter:brightness(.85)}
html.dark,html.dark body,html.dark .card,html.dark .page{transition:background-color 1.5s ease,color 1.5s ease}`;

// Hand-picked touches that go after the generated rules.
const LAST = `html.dark body{background:linear-gradient(160deg,#111a26 0%,#13201d 55%,#121a2b 100%)}`;

const NAVY = { bg: '#3b6496', fg: '#d6e4f7', border: '#7ea6d6' };
const VARCOL = { '--navy': '#1f3a5f', '--ink': '#1f2a44', '--muted': '#6b7280', '--card': '#ffffff', '--soft': '#eef7f1', '--soft2': '#e3f2e7', '--line': '#cfe5d6', '--sun': '#ffc857', '--leaf': '#2f8f5b', '--coral': '#ff7a90', '--sky': '#5aa9ff', '--lilac': '#c3a6ff', '--mint': '#7fd6b0' };

const hex2rgb = (h) => { h = h.slice(1); if (h.length === 3) h = [...h].map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const rgb2hsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; } return [h, s, l]; };
const hsl2hex = ([h, s, l]) => { const f = (n) => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); }; return '#' + f(0) + f(8) + f(4); };

const darkBg = (hex) => { let [h, s, l] = rgb2hsl(hex2rgb(hex)); if (l < 0.8) return null; if (s < 0.08) { h = 0.6; s = 0.25; } return hsl2hex([h, Math.min(s, 0.32), 0.14 + (1 - l) * 0.55]); }; // grays and white become the cards' blue-gray
const lightFg = (hex) => { const [h, s, l] = rgb2hsl(hex2rgb(hex)); if (l > 0.5) return null; return hsl2hex([h, Math.min(s, 0.6), 0.86 - l * 0.25]); };
const bright = (hex) => { const [, s, l] = rgb2hsl(hex2rgb(hex)); return l > 0.55 && l < 0.8 && s > 0.4; };

// Turns every color in a declaration's value into its dark version; returns null when nothing changed.
function convert(prop, value, ctx) {
  const isFg = prop === 'color' || prop === '-webkit-text-fill-color';
  const isBg = /^(background|background-color|fill)$/.test(prop);
  const isBorder = /^(border|border-(top|right|bottom|left)(-color)?|border-color|outline)$/.test(prop);
  if (!isFg && !isBg && !isBorder) return null;
  let changed = false;
  let v = value.replace(/var\(--navy\)/g, () => { changed = true; return isFg ? (ctx.keepFg ? 'var(--navy)' : NAVY.fg) : isBg ? NAVY.bg : NAVY.border; });
  if (isFg && ctx.keepFg) return null;
  v = v.replace(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g, (h) => { const out = isFg ? lightFg(h) : darkBg(h); if (out) { changed = true; return out; } return h; });
  v = v.replace(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)/g, (_, a) => { if (isFg) return _; changed = true; return `rgba(28,36,51,${a})`; });
  return changed ? v : null;
}

// The background color a rule paints, if it's a plain bright accent (then its text must stay dark).
function brightBg(decls) {
  for (const [p, v] of decls) if (/^background(-color)?$/.test(p)) { const m = v.match(/^#[0-9a-fA-F]{3,6}$/) || v.match(/^var\((--[a-z0-9]+)\)$/); if (!m) continue; const hex = m[1] ? VARCOL[m[1]] : m[0]; if (hex && bright(hex)) return true; }
  return false;
}

const prefix = (sel) => sel.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
  if (/^(html|:root)\b/.test(s)) return null;
  if (/^body\b/.test(s)) return 'html.dark ' + s;
  return 'html.dark ' + s;
}).filter(Boolean).join(',');

function walk(css) {
  const out = []; let i = 0;
  const block = (start) => { let d = 0; for (let j = start; j < css.length; j++) { if (css[j] === '{') d++; else if (css[j] === '}') { d--; if (d === 0) return j; } } return css.length; };
  while (i < css.length) {
    const open = css.indexOf('{', i); if (open < 0) break;
    const head = css.slice(i, open).replace(/\/\*[\s\S]*?\*\//g, '').trim(); const close = block(open); const body = css.slice(open + 1, close);
    if (head.startsWith('@media') || head.startsWith('@supports')) { const inner = walk(body); if (inner.length) out.push(`${head}{${inner.join('')}}`); }
    else if (!head.startsWith('@')) {
      const all = body.split(';').map((d) => { const k = d.indexOf(':'); return k < 0 ? null : [d.slice(0, k).trim(), d.slice(k + 1).trim()]; }).filter(Boolean);
      const decls = [...new Map(all.map((d) => [d[0], d])).values()]; // when a property is set twice, only the last one counts
      const keepFg = brightBg(decls); const outD = [];
      for (const [p, v] of decls) { const imp = /!important/.test(v); const c = convert(p, v.replace(/\s*!important/, ''), { keepFg }); if (c) outD.push(`${p}:${c}${imp ? '!important' : ''}`); }
      if (keepFg) { // a bright button or badge: keep its own color (a darkened general rule could otherwise win) and dark text on it
        const bg = decls.find(([p]) => /^background(-color)?$/.test(p)); if (bg && !outD.some((d) => d.startsWith(bg[0] + ':'))) outD.push(`${bg[0]}:${bg[1]}`);
        if (!decls.some(([p]) => p === 'color')) outD.push('color:#1f2a44');
      }
      const sel = prefix(head); if (outD.length && sel) out.push(`${sel}{${outD.join(';')}}\n`);
    }
    i = close + 1;
  }
  return out;
}

export async function build() {
  const css = (await readFile(join(here, 'style.css'), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
  return `/* Made by scripts/make-dark.mjs from style.css. Don't edit by hand: change style.css and run the script. */\n${VARS}\n${walk(css).join('')}${LAST}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) { const out = await build(); await writeFile(join(here, 'dark.css'), out); console.log(`dark.css: ${out.split('\n').length} lines`); }
