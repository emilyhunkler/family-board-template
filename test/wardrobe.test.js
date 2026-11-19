// Every look in the avatar set is in the wardrobe, and older boards get the new items without losing a parent's prices.
import test from 'node:test';
import assert from 'node:assert/strict';
import defaults from '../src/config.default.js';
import { upgradeWardrobe } from '../src/lib/wardrobe.js';

const cat = defaults.wardrobe.catalog;

test('all 45 hairstyles are in the catalog, and short styles are all free', () => {
  const hair = cat.filter((i) => i.kind === 'hair');
  assert.equal(hair.length, 45);
  assert.ok(hair.filter((i) => i.value.startsWith('short')).every((i) => i.cost === 0 && !i.minLevel));
});

test('catalog ids are unique', () => {
  assert.equal(new Set(cat.map((i) => i.id)).size, cat.length);
});

test('an older board gets the new items, keeps custom items and edited prices, and unedited old prices go free', () => {
  const c = { wardrobe: { catalog: [
    { id: 'h-long07', kind: 'hair', label: 'Bangs', value: 'long07', cost: 5 },
    { id: 'h-short13', kind: 'hair', label: 'Tousled', value: 'short13', cost: 3 },
    { id: 'x-star', kind: 'extra', label: 'My star', value: '⭐', cost: 99 },
    { id: 'custom-1', kind: 'extra', label: 'Family thing', value: '🧁', cost: 4 },
  ] } };
  assert.equal(upgradeWardrobe(c), true);
  const by = Object.fromEntries(c.wardrobe.catalog.map((i) => [i.id, i]));
  assert.equal(by['h-long07'].cost, 0);
  assert.equal(by['h-short13'].cost, 3);
  assert.equal(by['x-star'].cost, 99); assert.equal(by['x-star'].label, 'My star');
  assert.ok(by['custom-1']); assert.ok(by['k-soccer']); assert.ok(by['h-short07']);
  assert.equal(c.wardrobe.v, 2);
  assert.equal(upgradeWardrobe(c), false);
});
