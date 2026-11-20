// The grown-ups' settings screen is grouped into a few sections, each with a handful of pages. These tests make
// sure tidying it up never quietly drops a setting: everything the screen could change before is still there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../public/parents.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const literal = /const GROUPS = (\[[\s\S]*?\]\]\]\]);/.exec(src);
const GROUPS = new Function(`return ${literal[1]}`)();
const pages = GROUPS.flatMap(([, , , , list]) => list.map(([id]) => id));

// Every setting the screen could change on Nov 20, 2026, before the tidy-up.
const SETTINGS = ['ambient.dimAtNight', 'ambient.idleMinutes', 'ambient.morning', 'ambient.morningDays', 'ambient.showWeek', 'ambient.sleepFrom', 'ambient.sleepTo', 'bank', 'calendars', 'calendars[].color', 'calendars[].enabled', 'calendars[].name', 'calendars[].url', 'countdowns', 'countdowns[].date', 'countdowns[].emoji', 'countdowns[].title', 'family.dog', 'family.name', 'family.parents[].color', 'family.parents[].match', 'family.parents[].name', 'feedbackUrl', 'kids[].age', 'kids[].color', 'kids[].leaveTime', 'kids[].match', 'kids[].name', 'kids[].quizGrade', 'kids[].weeklyAllowance', 'photos', 'pin', 'places', 'places[].bufferMin', 'places[].driveMin', 'places[].lat', 'places[].lon', 'places[].match', 'places[].name', 'prize.bonusStars', 'prize.emoji', 'prize.item', 'prize.missesAllowed', 'prize.title', 'quests', 'quests[].emoji', 'quests[].stars', 'quests[].title', 'quests[].who', 'quiz', 'rewards', 'rewards[].cost', 'rewards[].emoji', 'rewards[].title', 'rewards[].who', 'rules.levelNames', 'rules.levelStars', 'rules.morningGate', 'rules.questsNeedApproval', 'rules.starsPerDollar', 'rules.undoSeconds', 'school.days', 'school.daysOff', 'setup', 'tasks', 'theme', 'tips', 'tips[].text', 'tips[].when', 'voice.ai', 'voice.chime', 'voice.cloud', 'voice.cloudVoice', 'voice.fallback', 'voice.handsFree', 'voice.kidsCan', 'voice.language', 'voice.pitch', 'voice.quietFrom', 'voice.quietTo', 'voice.rate', 'voice.speak', 'voice.voiceName', 'voice.wake', 'voice.wakeAlso', 'wardrobe.catalog[].cost', 'wardrobe.catalog[].label', 'wardrobe.catalog[].minLevel', 'wardrobe.catalog[].prizeOnly', 'weather.lat', 'weather.lon', 'weather.place', 'weather.units', 'week.closesAt', 'week.payDay', 'zone'];

const changed = new Set();
for (const m of src.matchAll(/\b[cx]\.((?:[A-Za-z_]\w*)(?:\.[A-Za-z_]\w*|\[\w+\])*)/g)) changed.add(m[1].replace(/\[\w+\]/g, '[]').replace(/\.(push|splice|filter|includes|sort)$/, ''));

test('every setting the screen had is still on it', () => {
  const missing = SETTINGS.filter((p) => !changed.has(p));
  assert.deepEqual(missing, [], 'settings no longer on the grown-ups screen: ' + missing.join(', '));
});

test('a few groups, each with only a handful of pages', () => {
  assert.ok(GROUPS.length <= 6, `${GROUPS.length} groups`);
  for (const [id, , name, short, list] of GROUPS) {
    assert.ok(list.length >= 1 && list.length <= 5, `${name} has ${list.length} pages`);
    assert.ok(short.length <= 9, `${id}'s short name "${short}" is too long for a phone`);
  }
  assert.equal(GROUPS[0][4][0][0], 'approve', 'approvals come first');
});

test('every page is listed once and has something to show', () => {
  assert.equal(new Set(pages).size, pages.length, 'a page is listed twice');
  const map = /const SECTION_COMPONENTS = \{([^\n]*)\};/.exec(src)[1];
  const drawn = [...map.matchAll(/(\w+): \(p\) => (\w+)\(p\)/g)];
  assert.deepEqual(drawn.map(([, id]) => id).sort(), [...pages].sort());
  for (const [, , fn] of drawn) assert.match(src, new RegExp(`function ${fn}\\(`), `${fn} is missing`);
});

test('links into the screen from the board still land on a page', () => {
  for (const [, id] of app.matchAll(/openParents\('(\w+)'\)/g)) assert.ok(pages.includes(id), `openParents('${id}')`);
  assert.match(src, /OLD_IDS = \{ settings: 'family' \}/, 'the old Settings page id still opens something');
});
