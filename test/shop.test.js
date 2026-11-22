// Buying in the wardrobe (family feedback, Nov 2026): a kid's Wardrobe button opens that kid's own wardrobe,
// buying asks on the board itself instead of the browser's yes/no box, and one press of Send saves one note.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shopState, shopWords } from '../public/shop.js';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
const kid = (balance, owned = [], level = 1) => ({ name: 'Ivette', wardrobe: { balance, owned }, level: { level } });
const bow = { id: 'x-bow', kind: 'extra', label: 'Big bow', value: '🎀', cost: 6 };

test('six stars buys a six-star item, with nothing left over', () => {
  assert.deepEqual(shopState(bow, kid(6)), { status: 'buy', left: 0 });
  assert.match(shopWords(bow, kid(6)).text, /Ivette will have ★ 0 left/);
});

test('not enough stars says how many more, in plain words', () => {
  const lilac = { id: 'b-lilac', kind: 'bg', label: 'Lilac', value: 'ece4ff', cost: 8 };
  assert.deepEqual(shopState(lilac, kid(6)), { status: 'short', need: 2 });
  assert.equal(shopWords(lilac, kid(6)).title, '2 stars to go!');
  assert.equal(shopWords(lilac, kid(7)).title, '1 star to go!');
});

test('free and owned items are just worn; level and prize items say why not', () => {
  assert.equal(shopState({ id: 'p-dog', cost: 0 }, kid(0)).status, 'have');
  assert.equal(shopState(bow, kid(0, ['x-bow'])).status, 'have');
  assert.equal(shopState({ id: 'b-ocean', cost: 15, minLevel: 2 }, kid(40, [], 1)).status, 'level');
  assert.equal(shopState({ id: 'b-ocean', cost: 15, minLevel: 2 }, kid(40, [], 2)).status, 'buy');
  assert.equal(shopState({ id: 'z', cost: 0, prizeOnly: true }, kid(40)).status, 'prize');
});

test('the wardrobe asks on the board, not with the browser yes/no box', () => {
  const ward = app.slice(app.indexOf('function Wardrobe('), app.indexOf('const AISLES'));
  assert.ok(!/confirm\(/.test(ward), 'no window.confirm in the wardrobe');
  assert.match(ward, /Yes, buy it!/);
  assert.match(ward, /busyRef\.current/, 'one press buys once');
});

test("a kid's Wardrobe button opens that kid's wardrobe, every time", () => {
  assert.match(app, /setWardKid\(\{ id: kid, at: Date\.now\(\) \}\)/);
  assert.match(app, /useEffect\(\(\) => \{ if \(want\?\.id\) setKid\(want\.id\); \}, \[want\]\)/);
});

test('one press of Send saves one note', () => {
  const fb = app.slice(app.indexOf('function FeedbackSheet('), app.indexOf('function FeedbackSheet(') + 3000);
  assert.match(fb, /sendingRef\.current\) return/);
  assert.match(fb, /disabled=\$\{!text\.trim\(\) \|\| sending\}/);
  // The Worker drops the same note sent again within 10 minutes, before the daily limit counts it.
  const at = worker.indexOf("path === '/api/feedback' && method === 'POST'");
  const block = worker.slice(at, at + 1200);
  assert.ok(block.indexOf('already: true') > 0 && block.indexOf('already: true') < block.indexOf("A.check(env, 'fb:'"));
});
