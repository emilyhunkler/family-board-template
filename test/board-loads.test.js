// The board's files load each other in a circle (app.js loads parents.js and install.js, which borrow from
// app.js). If a file uses something borrowed from app.js while it is still loading, the browser stops with an
// error and the board sits on "Loading the board…" forever. This test loads every file the way a browser does,
// with the outside libraries (Preact and friends) swapped for stand-ins, so such a mistake fails here first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = new URL('../public/', import.meta.url);
// Every name the board takes from outside libraries, so each stand-in can offer all of them.
const names = new Set();
for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
  for (const m of readFileSync(new URL(f, dir), 'utf8').matchAll(/import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*'https:[^']+'/g)) {
    for (const n of (m[2] || '').split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) names.add(n);
  }
}
const STUB = `const f = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : f), apply: () => f, construct: () => f });
export default f; ${[...names].map((n) => `export const ${n} = ${n === 'useState' ? '(v) => [typeof v === "function" ? v() : v, f]' : n === 'useRef' ? '(v) => ({ current: v })' : n === 'useMemo' ? '(fn) => fn()' : 'f'};`).join(' ')}`;
const HOOKS = `export async function resolve(s, c, n) { return s.startsWith('https://') ? { url: 'stub:' + s, shortCircuit: true } : n(s, c); }
export async function load(u, c, n) { return u.startsWith('stub:') ? { format: 'module', source: ${JSON.stringify(STUB)}, shortCircuit: true } : n(u, c); }`;
const REGISTER = `import { register } from 'node:module'; register('data:text/javascript,' + encodeURIComponent(${JSON.stringify(HOOKS)}));`;
const BROWSER = `
const noop = () => {}; const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const el = () => ({ style: {}, classList: { add: noop, remove: noop, toggle: noop }, appendChild: noop, remove: noop, setAttribute: noop, addEventListener: noop });
Object.assign(globalThis, { window: globalThis, addEventListener: noop, removeEventListener: noop, dispatchEvent: noop, matchMedia: () => ({ matches: false, addEventListener: noop }),
  localStorage: store(), sessionStorage: store(), location: { search: '', hash: '', host: 'board.test', origin: 'https://board.test', pathname: '/' }, history: { replaceState: noop },
  innerWidth: 400, innerHeight: 800, document: { getElementById: el, querySelector: () => null, createElement: el, documentElement: el(), body: el(), addEventListener: noop, visibilityState: 'visible' } });`;

test('every file of the board loads without stopping the board', () => {
  const app = fileURLToPath(new URL('app.js', dir));
  try { execFileSync(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(REGISTER), '--input-type=module', '-e', `${BROWSER}\nawait import(${JSON.stringify('file://' + app)});\nconsole.log('loaded');`], { stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { assert.fail('The board would be stuck on "Loading the board…":\n' + String(e.stderr || e.message).split('\n').filter((l) => /Error|at file/.test(l)).slice(0, 6).join('\n')); }
});
