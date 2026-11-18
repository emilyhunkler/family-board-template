// Brain quests: builds a short quiz for one kid. Math questions are made fresh each time (so they're
// endless and always right); science and social studies come from the checked bank in quiz-bank.js.
// No imports from the web here, so the tests can run it in Node.
import { BANK } from './quiz-bank.js';

export const SUBJECTS = [
  { id: 'math', label: 'Math', emoji: '🔢' },
  { id: 'science', label: 'Science', emoji: '🔬' },
  { id: 'social', label: 'Social studies', emoji: '🌎' },
  { id: 'mix', label: 'Surprise mix', emoji: '🎲' },
];
export const subjectLabel = (id) => SUBJECTS.find((s) => s.id === id)?.label || id;

const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1)); // whole number from a to b
const pickOne = (r, xs) => xs[Math.floor(r() * xs.length)];
export function shuffle(xs, r = Math.random) { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const lcm = (a, b) => (a * b) / gcd(a, b);
const frac = (n, d) => { const g = gcd(n, d); n /= g; d /= g; return d === 1 ? String(n) : `${n}/${d}`; };
const fmt = (x) => (Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100));
const comma = (n) => n.toLocaleString('en-US');

// Three wrong answers near the right one: different, and not negative unless allowed.
function near(r, ans, { spread = 3, neg = false, show = fmt, extra = [] } = {}) {
  const out = new Set(); const right = show(ans);
  for (const e of extra) if (out.size < 3 && show(e) !== right && (neg || e >= 0)) out.add(show(e));
  let tries = 0; while (out.size < 3 && tries++ < 200) { const step = ri(r, 1, spread) * (r() < 0.5 ? -1 : 1); const v = ans + step * (Number.isInteger(ans) ? 1 : 0.1); const s = show(v); if (s !== right && (neg || v >= 0)) out.add(s); }
  return [right, ...[...out].slice(0, 3)];
}
const Q = (q, a, why, topic) => ({ q, a, why, topic });

// One generator per kind of problem, tagged with the grades it suits.
const GEN = [
  // grades 1-2
  [[1, 2], (r) => { const a = ri(r, 2, 12), b = ri(r, 1, 9); return Q(`What is ${a} + ${b}?`, near(r, a + b), `${a} plus ${b} makes ${a + b}.`, 'Adding'); }],
  [[1, 2], (r) => { const a = ri(r, 8, 20), b = ri(r, 1, a - 1); return Q(`What is ${a} − ${b}?`, near(r, a - b), `Take ${b} away from ${a} and ${a - b} are left.`, 'Subtracting'); }],
  [[1, 2], (r) => { const a = ri(r, 3, 9), b = ri(r, 2, 8); return Q(`You have ${a} stickers and get ${b} more. How many now?`, near(r, a + b), `${a} + ${b} = ${a + b}.`, 'Word problems'); }],
  [[1, 2], (r) => { const s = pickOne(r, [2, 5, 10]); const st = s * ri(r, 1, 5); const seq = [0, 1, 2, 3].map((i) => st + i * s); return Q(`What comes next? ${seq.join(', ')}, ...`, near(r, st + 4 * s, { spread: 2, extra: [st + 4 * s + 1, st + 3 * s + 1, st + 5 * s] }), `The numbers go up by ${s} each time.`, 'Patterns'); }],
  [[2, 3], (r) => { const a = ri(r, 15, 60), b = ri(r, 11, 39); return Q(`What is ${a} + ${b}?`, near(r, a + b, { spread: 10, extra: [a + b + 10, a + b - 10] }), `Add the tens, then the ones: ${a + b}.`, 'Adding'); }],
  [[2, 3], (r) => { const a = ri(r, 40, 99), b = ri(r, 12, a - 10); return Q(`What is ${a} − ${b}?`, near(r, a - b, { spread: 10, extra: [a - b + 10, a - b - 10] }), `${a} − ${b} = ${a - b}.`, 'Subtracting'); }],
  [[2, 3], (r) => { const h = ri(r, 1, 11), m = pickOne(r, [0, 30]); const add = pickOne(r, [30, 60, 90]); const t = h * 60 + m + add; const show = (x) => `${Math.floor(x / 60) > 12 ? Math.floor(x / 60) - 12 : Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`; const opts = [t, t + 30, t - 30, t + 60].map(show); return Q(`It's ${h}:${String(m).padStart(2, '0')}. What time will it be in ${add} minutes?`, opts, `${add} minutes after ${h}:${String(m).padStart(2, '0')} is ${show(t)}.`, 'Time'); }],
  // grades 3-4
  [[3, 4], (r) => { const a = ri(r, 2, 10), b = ri(r, 2, 10); return Q(`What is ${a} × ${b}?`, near(r, a * b, { spread: 2, extra: [a * b + a, a * b - b, a + b] }), `${a} groups of ${b} make ${a * b}.`, 'Multiplying'); }],
  [[3, 4], (r) => { const b = ri(r, 2, 10), q = ri(r, 2, 10); return Q(`What is ${b * q} ÷ ${b}?`, near(r, q, { spread: 2 }), `${b} × ${q} = ${b * q}, so ${b * q} ÷ ${b} = ${q}.`, 'Dividing'); }],
  [[3, 4], (r) => { const l = ri(r, 3, 12), w = ri(r, 2, 9); return Q(`A rectangle is ${l} cm long and ${w} cm wide. What is its perimeter?`, near(r, 2 * (l + w), { spread: 3, extra: [l * w, l + w] }).map((x) => x + ' cm'), `Perimeter adds all four sides: ${l} + ${w} + ${l} + ${w} = ${2 * (l + w)}.`, 'Measurement'); }],
  [[3, 4], (r) => { const n = ri(r, 12, 98); const ans = Math.round(n / 10) * 10; return Q(`What is ${n} rounded to the nearest ten?`, near(r, ans, { spread: 1, extra: [ans + 10, ans - 10, Math.floor(n / 10) * 10 === ans ? ans + 10 : ans - 10] }).map((x) => x), `${n} is closer to ${ans} than to the other ten.`, 'Rounding'); }],
  [[3, 4], (r) => { const [x, y] = shuffle([2, 3, 4, 5, 6, 8], r).slice(0, 2); const big = Math.min(x, y); return Q(`Which is bigger: 1/${x} or 1/${y}?`, [`1/${big}`, `1/${Math.max(x, y)}`, 'They are equal', `1/${x + y}`], `Cutting into fewer pieces makes each piece bigger, so 1/${big} wins.`, 'Fractions'); }],
  [[3, 4], (r) => { const a = ri(r, 4, 9), b = ri(r, 3, 9); return Q(`Each box holds ${a} crayons. How many crayons are in ${b} boxes?`, near(r, a * b, { spread: 3, extra: [a + b, a * b + a] }), `${b} × ${a} = ${a * b}.`, 'Word problems'); }],
  [[4, 5], (r) => { const a = ri(r, 12, 99), b = ri(r, 3, 9); return Q(`What is ${a} × ${b}?`, near(r, a * b, { spread: 10, extra: [a * b + 10, a * b - b] }), `${a} × ${b} = ${a * b}.`, 'Multiplying'); }],
  [[4, 5], (r) => { const b = ri(r, 3, 9), q = ri(r, 4, 15), rem = ri(r, 1, b - 1); const n = b * q + rem; return Q(`What is ${n} ÷ ${b}?`, [`${q} R${rem}`, `${q + 1} R${rem}`, `${q} R${rem === 1 ? 2 : rem - 1}`, `${q - 1} R${rem}`], `${b} × ${q} = ${b * q}, with ${rem} left over.`, 'Dividing'); }],
  [[4, 5], (r) => { const d = pickOne(r, [3, 4, 5, 6, 8]); const n = ri(r, 1, d - 1); const k = ri(r, 2, 4); return Q(`Which fraction is equal to ${n}/${d}?`, [`${n * k}/${d * k}`, `${n + k}/${d + k}`, `${n * k}/${d}`, `${n}/${d * k}`], `Multiply the top and bottom by ${k}: ${n * k}/${d * k}.`, 'Fractions'); }],
  [[4, 5], (r) => { const d = pickOne(r, [5, 6, 8, 10, 12]); const a = ri(r, 1, d - 2), b = ri(r, 1, d - a - 1); return Q(`What is ${a}/${d} + ${b}/${d}?`, [`${a + b}/${d}`, `${a + b}/${2 * d}`, `${a * b}/${d}`, `${a + b + 1}/${d}`], `Same bottom number, so add the tops: ${a + b}/${d}.`, 'Fractions'); }],
  [[4, 5], (r) => { const l = ri(r, 4, 15), w = ri(r, 3, 12); return Q(`What is the area of a rectangle ${l} m by ${w} m?`, near(r, l * w, { spread: 4, extra: [2 * (l + w), l + w] }).map((x) => x + ' sq m'), `Area is length × width: ${l} × ${w} = ${l * w}.`, 'Measurement'); }],
  [[4, 5], (r) => { const n = ri(r, 1001, 9899); const ans = Math.round(n / 100) * 100; return Q(`Round ${comma(n)} to the nearest hundred.`, [ans, ans + 100, ans - 100, Math.round(n / 1000) * 1000 === ans ? ans + 200 : Math.round(n / 1000) * 1000].map(comma), `Look at the tens digit to decide: ${comma(ans)}.`, 'Rounding'); }],
  // grades 5-6
  [[5, 6], (r) => { const a = ri(r, 11, 49) / 10, b = ri(r, 11, 49) / 10; const s = Math.round((a + b) * 10) / 10; return Q(`What is ${a} + ${b}?`, near(r, s, { spread: 3, extra: [s + 1, s - 1] }), `Line up the decimal points: ${a} + ${b} = ${s}.`, 'Decimals'); }],
  [[5, 6], (r) => { const a = ri(r, 12, 35), b = ri(r, 11, 25); return Q(`What is ${a} × ${b}?`, near(r, a * b, { spread: 10, extra: [a * b + 10, a * b - 10, a * b + a] }), `${a} × ${b} = ${a * b}.`, 'Multiplying'); }],
  [[5, 6], (r) => { const l = ri(r, 2, 9), w = ri(r, 2, 8), h = ri(r, 2, 6); return Q(`A box is ${l} × ${w} × ${h} cm. What is its volume?`, near(r, l * w * h, { spread: 6, extra: [l * w + h, 2 * (l * w + w * h + l * h)] }).map((x) => x + ' cubic cm'), `Volume is length × width × height = ${l * w * h}.`, 'Volume'); }],
  [[5, 6], (r) => { const a = ri(r, 2, 9), b = ri(r, 2, 9), c = ri(r, 2, 9); return Q(`What is ${a} + ${b} × ${c}?`, near(r, a + b * c, { spread: 3, extra: [(a + b) * c] }), `Multiply first: ${b} × ${c} = ${b * c}, then add ${a}.`, 'Order of operations'); }],
  [[5, 6], (r) => { const d = pickOne(r, [3, 4, 5, 6, 8]); const n = ri(r, 1, d - 1); const w = d * ri(r, 2, 6); return Q(`What is ${n}/${d} of ${w}?`, near(r, (w / d) * n, { spread: 3, extra: [w / d, w - (w / d) * n] }), `${w} ÷ ${d} = ${w / d}, and ${n} of those is ${(w / d) * n}.`, 'Fractions'); }],
  [[5, 6], (r) => { const p = pickOne(r, [10, 20, 25, 50, 75]); const n = pickOne(r, [20, 40, 60, 80, 120, 200]); const ans = (p / 100) * n; return Q(`What is ${p}% of ${n}?`, near(r, ans, { spread: 5, extra: [n - ans, ans * 2] }), `${p}% means ${p} out of 100, so it's ${ans}.`, 'Percents'); }],
  [[6, 7], (r) => { const a = ri(r, 2, 9), b = ri(r, 3, 15); const x = ri(r, 2, 12); return Q(`Solve for x: ${a}x + ${b} = ${a * x + b}`, near(r, x, { spread: 2, extra: [x + b, (a * x + b) / a] }).map((v) => 'x = ' + v), `Subtract ${b}, then divide by ${a}: x = ${x}.`, 'Equations'); }],
  [[6, 7], (r) => { const a = ri(r, 2, 12), b = ri(r, 2, 12); const g = gcd(a * 2, b * 3); return Q(`What is the greatest common factor of ${a * 2} and ${b * 3}?`, near(r, g, { spread: 2, extra: [g * 2, 1, Math.min(a * 2, b * 3)] }), `${g} is the biggest number that divides both evenly.`, 'Factors'); }],
  [[6, 7], (r) => { const a = pickOne(r, [3, 4, 6, 8, 9]), b = pickOne(r, [5, 6, 10, 12]); if (a === b) return null; return Q(`What is the least common multiple of ${a} and ${b}?`, near(r, lcm(a, b), { spread: 3, extra: [a * b === lcm(a, b) ? lcm(a, b) * 2 : a * b, a + b] }), `${lcm(a, b)} is the smallest number both go into.`, 'Factors'); }],
  [[6, 7], (r) => { const a = ri(r, -12, -2), b = ri(r, 3, 15); return Q(`What is ${a} + ${b}?`, near(r, a + b, { neg: true, spread: 3, extra: [-(a + b), a - b] }), `Start at ${a} and move ${b} to the right: ${a + b}.`, 'Negative numbers'); }],
  [[6, 7], (r) => { const b = ri(r, 4, 14) * 2, h = ri(r, 3, 12); return Q(`A triangle has base ${b} and height ${h}. What is its area?`, near(r, (b * h) / 2, { spread: 5, extra: [b * h, b + h] }), `Triangle area is half of base × height: ${(b * h) / 2}.`, 'Geometry'); }],
  [[6, 7], (r) => { const a = ri(r, 2, 5), b = ri(r, 3, 8), k = ri(r, 2, 6); return Q(`The ratio of red to blue marbles is ${a}:${b}. If there are ${a * k} red, how many blue?`, near(r, b * k, { spread: 3, extra: [a * k + (b - a), b + a * k] }), `${a * k} is ${k} times ${a}, so blue is ${k} × ${b} = ${b * k}.`, 'Ratios'); }],
  [[6, 7], (r) => { const n = ri(r, 2, 12); return Q(`What is ${n}²?`, near(r, n * n, { spread: 4, extra: [n * 2, n * n + n] }), `${n}² means ${n} × ${n} = ${n * n}.`, 'Exponents'); }],
  // grades 7-8
  [[7, 8], (r) => { const a = ri(r, -9, -2), b = ri(r, 2, 9); return Q(`What is ${a} × ${b}?`, near(r, a * b, { neg: true, spread: 3, extra: [-a * b, a + b] }), `A negative times a positive is negative: ${a * b}.`, 'Negative numbers'); }],
  [[7, 8], (r) => { const price = pickOne(r, [20, 40, 60, 80, 120, 150]); const off = pickOne(r, [10, 20, 25, 50]); const ans = price - (price * off) / 100; return Q(`A $${price} game is ${off}% off. What is the sale price?`, near(r, ans, { spread: 5, extra: [(price * off) / 100, price - off] }).map((x) => '$' + x), `${off}% of $${price} is $${(price * off) / 100}, so it costs $${ans}.`, 'Percents'); }],
  [[7, 8], (r) => { const a = ri(r, 2, 6), x = ri(r, 2, 9), c = ri(r, 1, a - 1 || 1); const b = ri(r, 1, 12); if (a === c) return null; const d = a * x + b - c * x; return Q(`Solve: ${a}x + ${b} = ${c}x + ${d}`, near(r, x, { spread: 2, neg: true, extra: [x + 1, -x] }).map((v) => 'x = ' + v), `Move the x's to one side: ${a - c}x = ${d - b}, so x = ${x}.`, 'Equations'); }],
  [[7, 8], (r) => { const n = ri(r, 2, 15); return Q(`What is the square root of ${n * n}?`, near(r, n, { spread: 3, extra: [(n * n) / 2] }), `${n} × ${n} = ${n * n}.`, 'Roots'); }],
  [[7, 8], (r) => { const [a, b, c] = pickOne(r, [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15]]); return Q(`A right triangle has legs ${a} and ${b}. How long is the longest side?`, near(r, c, { spread: 3, extra: [a + b] }), `a² + b² = c²: ${a * a} + ${b * b} = ${c * c}, and √${c * c} = ${c}.`, 'Geometry'); }],
  [[7, 8], (r) => { const x1 = ri(r, -5, 3), y1 = ri(r, -5, 5), m = pickOne(r, [-3, -2, -1, 1, 2, 3]), dx = ri(r, 1, 4); return Q(`What is the slope of the line through (${x1}, ${y1}) and (${x1 + dx}, ${y1 + m * dx})?`, near(r, m, { neg: true, spread: 2, extra: [-m, dx] }), `Rise over run: ${m * dx} ÷ ${dx} = ${m}.`, 'Graphs'); }],
  [[7, 8], (r) => { const a = ri(r, 2, 5), b = ri(r, 2, 5); return Q(`Simplify: x^${a} × x^${b}`, [`x^${a + b}`, `x^${a * b}`, `2x^${a + b}`, `x^${Math.abs(a - b) || a + b + 1}`], `Multiply same bases by adding the exponents: ${a} + ${b} = ${a + b}.`, 'Exponents'); }],
  [[7, 8], (r) => { const m = ri(r, 12, 98) / 10, e = ri(r, 3, 6); const n = Math.round(m * 10 ** e); return Q(`How do you write ${comma(n)} in scientific notation?`, [`${m} × 10^${e}`, `${m} × 10^${e + 1}`, `${m} × 10^${e - 1}`, `${Math.round(m * 10)} × 10^${e}`], `Move the decimal ${e} places: ${m} × 10^${e}.`, 'Scientific notation'); }],
  [[7, 8], (r) => { const red = ri(r, 1, 6), blue = ri(r, 2, 8); return Q(`A bag has ${red} red and ${blue} blue marbles. What's the chance of picking red?`, [frac(red, red + blue), frac(blue, red + blue), frac(red, blue), frac(1, red + blue) === frac(red, red + blue) ? frac(red + 1, red + blue + 1) : frac(1, red + blue)], `${red} red out of ${red + blue} total = ${frac(red, red + blue)}.`, 'Probability'); }],
];

export function mathQuestion(grade, r = Math.random) {
  const fits = GEN.filter(([g]) => grade >= g[0] && grade <= g[1]); const lower = GEN.filter(([g]) => g[1] === grade - 1);
  for (let tries = 0; tries < 20; tries++) { const pool = lower.length && r() < 0.15 ? lower : fits.length ? fits : GEN; const q = pickOne(r, pool)[1](r); if (q && new Set(q.a).size === 4) return q; }
  return mathQuestion(Math.max(1, grade - 1), r);
}

const band = (g) => (g <= 2 ? 2 : g <= 4 ? 4 : g <= 6 ? 6 : 8);
function bankQuestions(subject, grade, region, asked, n, r) {
  const b = band(grade); const ok = (x) => !(region === 'world' && x.us);
  const here = (BANK[subject]?.[b] || []).filter(ok); const below = b > 2 ? (BANK[subject]?.[b - 2] || []).filter(ok) : [];
  const fresh = shuffle(here.filter((x) => !asked.has(x.id)), r).concat(shuffle(below.filter((x) => !asked.has(x.id)), r).slice(0, 2));
  const out = fresh.slice(0, n); if (out.length < n) out.push(...shuffle(here.filter((x) => !out.includes(x)), r).slice(0, n - out.length)); // seen them all: start over
  return out.slice(0, n);
}

// Level for this quiz: the kid's set grade, nudged up after perfect scores and down after rough ones.
export function quizGrade(base, recent = []) {
  const last = recent.slice(0, 3); let adj = 0;
  if (last.length >= 2 && last.slice(0, 2).every((x) => x.score === x.total)) adj = 1;
  if (last[0] && last[0].score <= Math.floor(last[0].total / 2)) adj = -1;
  return Math.max(1, Math.min(8, base + adj));
}

// The quiz: n questions, each with its choices shuffled and the right one remembered.
export function buildQuiz({ subject, grade, region = 'us', asked = [], n = 5, r = Math.random }) {
  const seen = new Set(asked); let qs;
  if (subject === 'math') qs = Array.from({ length: n }, () => mathQuestion(grade, r));
  else if (subject === 'mix') { const s = Math.ceil(n / 3), so = Math.floor((n - s) / 2); qs = shuffle([...bankQuestions('science', grade, region, seen, s, r), ...bankQuestions('social', grade, region, seen, so, r), ...Array.from({ length: n - s - so }, () => mathQuestion(grade, r))], r); }
  else qs = bankQuestions(subject, grade, region, seen, n, r);
  return qs.filter(Boolean).map((x) => { const choices = shuffle(x.a, r); return { id: x.id || null, q: x.q, choices, right: choices.indexOf(x.a[0]), why: x.why, topic: x.topic, subject: x.id ? (x.id.startsWith('sc') ? 'science' : 'social') : 'math' }; });
}
