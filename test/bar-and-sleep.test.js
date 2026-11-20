// Two kitchen-screen fixes from family feedback (Nov 2026): the bottom tab bar shows each kid as their own
// avatar, not as their pet sticker, and the photo screensaver keeps clear of the iPad's clock and battery.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');

test('avatar stickers keep their small size inside buttons that set a big emoji size', () => {
  assert.match(css, /\.av \.avb\{position:absolute;font-size:24cqw/, 'sticker rule must beat ".navbar button span"');
});

test('the tab bar shows the kid, not their pet sticker', () => {
  assert.match(css, /\.navbar \.av \.avb\{display:none\}/);
});

test('the photo screensaver leaves room for the status bar', () => {
  assert.match(css, /\.ambient\.photos,\.ambient\.photos\.withweek\{padding-top:max\(28px,calc\(env\(safe-area-inset-top\) \+ 18px\)\)\}/);
  // It has to come after the tighter photo padding, or that padding wins again.
  assert.ok(css.indexOf('.ambient.photos,.ambient.photos.withweek{padding-top') > css.indexOf('.ambient.photos.withweek{padding:22px 24px'));
});
