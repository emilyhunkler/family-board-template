// Brain quests: math questions must always have exactly one right answer among four different choices,
// and quizzes must come out the right size for every grade and subject.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mathQuestion, buildQuiz, quizGrade } from '../public/quiz.js';
import { BANK } from '../public/quiz-bank.js';

// A repeatable random generator, so a failure can be reproduced.
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

// Works out the right answer on its own for the simple arithmetic questions, to check the generator.
function solve(q) {
  let m;
  if ((m = q.match(/^What is (-?\d+(?:\.\d+)?) \+ (-?\d+(?:\.\d+)?)\?$/))) return String(Math.round((+m[1] + +m[2]) * 100) / 100);
  if ((m = q.match(/^What is (\d+) − (\d+)\?$/))) return String(+m[1] - +m[2]);
  if ((m = q.match(/^What is (-?\d+) × (\d+)\?$/))) return String(+m[1] * +m[2]);
  if ((m = q.match(/^What is (\d+) ÷ (\d+)\?$/)) && +m[1] % +m[2] === 0) return String(+m[1] / +m[2]);
  if ((m = q.match(/^What is (\d+) \+ (\d+) × (\d+)\?$/))) return String(+m[1] + +m[2] * +m[3]);
  if ((m = q.match(/^What is (\d+)% of (\d+)\?$/))) return String((+m[1] * +m[2]) / 100);
  if ((m = q.match(/^What is (\d+)²\?$/))) return String(+m[1] * +m[1]);
  if ((m = q.match(/^What is the square root of (\d+)\?$/))) return String(Math.sqrt(+m[1]));
  if ((m = q.match(/^Solve for x: (\d+)x \+ (\d+) = (\d+)$/))) return 'x = ' + (+m[3] - +m[2]) / +m[1];
  return null;
}

test('math questions: four different choices, and the checked ones are right', () => {
  let checked = 0;
  for (let g = 1; g <= 8; g++) {
    const r = rng(g * 99);
    for (let i = 0; i < 1500; i++) {
      const q = mathQuestion(g, r);
      assert.equal(q.a.length, 4, q.q); assert.equal(new Set(q.a).size, 4, `${q.q} ${q.a}`);
      assert.ok(q.why && q.topic, q.q); assert.ok(!/NaN|undefined|Infinity/.test(q.q + q.a.join() + q.why), `${q.q} ${q.a} ${q.why}`);
      const want = solve(q.q); if (want != null) { assert.equal(q.a[0], want, q.q); checked++; }
    }
  }
  assert.ok(checked > 2000, 'enough questions were double-checked: ' + checked);
});

test('question bank: well formed', () => {
  const ids = new Set();
  for (const s of ['science', 'social']) for (const b of [2, 4, 6, 8]) {
    const list = BANK[s][b]; assert.ok(list.length >= 20, `${s} ${b}`);
    for (const x of list) { assert.ok(!ids.has(x.id), x.id); ids.add(x.id); assert.equal(new Set(x.a).size, 4, x.id); assert.ok(x.q && x.why && x.topic, x.id); }
  }
});

test('quizzes: right size for every grade and subject, no repeats inside a quiz', () => {
  for (let g = 1; g <= 8; g++) for (const subject of ['math', 'science', 'social', 'mix']) for (const region of ['us', 'world']) {
    const qz = buildQuiz({ subject, grade: g, region, n: 5, r: rng(g + subject.length) });
    assert.equal(qz.length, 5, `${subject} ${g}`);
    for (const q of qz) { assert.equal(q.choices.length, 4); assert.ok(q.right >= 0 && q.right < 4); }
    const ids = qz.map((q) => q.id).filter(Boolean); assert.equal(new Set(ids).size, ids.length);
    if (region === 'world') for (const q of qz) if (q.id) assert.ok(!Object.values(BANK.social).flat().find((x) => x.id === q.id)?.us, q.id);
  }
});

test('quizzes skip questions asked recently', () => {
  const first = buildQuiz({ subject: 'science', grade: 4, n: 5, r: rng(1) }); const asked = first.map((q) => q.id);
  const second = buildQuiz({ subject: 'science', grade: 4, n: 5, asked, r: rng(2) });
  assert.equal(second.filter((q) => asked.includes(q.id)).length, 0);
});

test('level nudges up after two perfect scores and down after a rough one', () => {
  assert.equal(quizGrade(4, []), 4);
  assert.equal(quizGrade(4, [{ score: 5, total: 5 }, { score: 5, total: 5 }]), 5);
  assert.equal(quizGrade(4, [{ score: 2, total: 5 }]), 3);
  assert.equal(quizGrade(8, [{ score: 5, total: 5 }, { score: 5, total: 5 }]), 8);
  assert.equal(quizGrade(1, [{ score: 0, total: 5 }]), 1);
});
