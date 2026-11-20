// Off-screen time, with the mascot as the family's guide. No outside libraries here, so the tests can load it.
//  - The family idea of the day: one thing to do together, away from the screen, that fits the season, today's
//    weather and whether it's a school night or the weekend. Every screen picks the same one from the same facts.
//  - "Go play!": after a few minutes of tapping on the board with nothing getting done, the board takes a break.

// [id, emoji, idea, kind, needs]. kinds: out, read, music, games, people, help, make, cook.
// needs: out = dry and not too hot or cold, warm = a warm dry day, wet = puddle weather, snow = it's snowing,
// long = a weekend-sized idea, and spring/summer/fall/winter = only in that season.
export const IDEAS = [
  // outdoors
  ['walk', '🚶', 'Take a walk around the block after dinner', 'out', 'out'],
  ['bikes', '🚲', 'Go for a bike or scooter ride together', 'out', 'out'],
  ['catch', '⚾', 'Play catch in the yard', 'out', 'out'],
  ['tag', '🏃', 'Play tag or hide and seek outside', 'out', 'out'],
  ['chalk', '🖍️', 'Draw a sidewalk chalk mural', 'out', 'out warm'],
  ['hunt', '🔎', 'Go on a nature scavenger hunt: a feather, a smooth rock, something red', 'out', 'out'],
  ['clouds', '☁️', 'Lie on the grass and find shapes in the clouds', 'out', 'out warm'],
  ['stars', '🌟', 'Step outside after dark and find the moon and three stars', 'out', 'out'],
  ['park', '🛝', 'Head to the playground together', 'out', 'out'],
  ['hike', '🥾', 'Go on a family hike on a trail you haven’t tried', 'out', 'out long'],
  ['picnic', '🧺', 'Pack a picnic and eat it outside', 'out', 'out warm long'],
  ['bubbles', '🫧', 'Blow bubbles in the yard and chase them', 'out', 'out warm'],
  ['water', '💦', 'Run through the sprinkler or have a water balloon fight', 'out', 'warm summer'],
  ['garden', '🌱', 'Plant something together and give it a name', 'out', 'out spring'],
  ['flowers', '🌷', 'Look for the first flowers of spring on a walk', 'out', 'out spring'],
  ['kite', '🪁', 'Fly a kite, or make one from paper and string', 'out', 'out spring long'],
  ['berries', '🍓', 'Go berry picking or visit a farmers market', 'out', 'out summer long'],
  ['leaves', '🍂', 'Rake a big pile of leaves and jump in it', 'out', 'out fall'],
  ['acorns', '🌰', 'Collect the prettiest leaves and pinecones you can find', 'out', 'out fall'],
  ['pumpkin', '🎃', 'Visit a pumpkin patch or an apple orchard', 'out', 'out fall long'],
  ['snowman', '⛄', 'Build a snowman together', 'out', 'snow'],
  ['sled', '🛷', 'Go sledding, then warm up with cocoa', 'out', 'snow'],
  ['puddles', '☔', 'Put on boots and jump in puddles', 'out', 'wet'],
  ['birds', '🐦', 'Watch for birds out the window and count how many kinds you see', 'out', ''],
  // reading
  ['readaloud', '📖', 'Read a chapter out loud together', 'read', ''],
  ['library', '📚', 'Visit the library and everyone picks a new book', 'read', 'long'],
  ['fort', '🏕️', 'Build a blanket fort and read inside it', 'read', ''],
  ['swapread', '🔁', 'Swap books: everyone reads a page of someone else’s favorite', 'read', ''],
  ['flashlight', '🔦', 'Flashlight reading before bed', 'read', ''],
  ['story', '✍️', 'Make up a story together, one sentence each', 'read', ''],
  // music
  ['practice', '🎻', 'Practice an instrument while everyone listens, then clap!', 'music', ''],
  ['dance', '💃', 'Have a kitchen dance party: everyone picks one song', 'music', ''],
  ['band', '🥁', 'Start a pots-and-pans family band', 'music', ''],
  ['sing', '🎤', 'Sing a song together, as loud or as silly as you like', 'music', ''],
  ['namethat', '🎶', 'Hum a song and let the others guess it', 'music', ''],
  // games
  ['boardgame', '🎲', 'Play a board game after dinner', 'games', ''],
  ['cards', '🃏', 'Play a card game: Go Fish, Crazy Eights or Uno', 'games', ''],
  ['puzzle', '🧩', 'Work on a puzzle together', 'games', ''],
  ['charades', '🎭', 'Play charades: act out animals, movies or jobs', 'games', ''],
  ['isspy', '👀', 'Play I Spy, or Twenty Questions at dinner', 'games', ''],
  ['tournament', '🏆', 'Hold a family game tournament with a silly trophy', 'games', 'long'],
  // friends and family
  ['grandparents', '📞', 'Call a grandparent and tell them about your week', 'people', ''],
  ['letter', '💌', 'Write a letter or draw a card for someone you love', 'people', ''],
  ['playdate', '👫', 'Invite a friend over to play', 'people', 'long'],
  ['visit', '🏡', 'Visit grandparents, cousins or old friends', 'people', 'long'],
  ['photos', '🖼️', 'Look through old family photos and tell the stories', 'people', ''],
  ['highlow', '💬', 'At dinner, everyone shares their high and low of the day', 'people', ''],
  // helping someone
  ['neighbor', '🤝', 'Do something kind for a neighbor', 'help', ''],
  ['treats', '🍪', 'Bake a treat to give away', 'help', ''],
  ['donate', '🎁', 'Pick toys or clothes you’ve outgrown to give away', 'help', ''],
  ['surprise', '💛', 'Do a secret helpful thing for someone at home', 'help', ''],
  ['tidy', '🧹', 'Race the timer: tidy one room together in 10 minutes', 'help', ''],
  // making things
  ['draw', '🎨', 'Everyone draws the same thing, then compare', 'make', ''],
  ['build', '🧱', 'Build the tallest tower you can from blocks or boxes', 'make', ''],
  ['crafts', '✂️', 'Make something from the recycling bin', 'make', ''],
  ['science', '🧪', 'Try a kitchen science experiment: baking soda and vinegar', 'make', ''],
  ['snowflakes', '❄️', 'Cut out paper snowflakes and hang them up', 'make', 'winter'],
  // cooking
  ['cook', '🍳', 'Cook dinner together: everyone gets a job', 'cook', ''],
  ['pancakes', '🥞', 'Make a big pancake breakfast together', 'cook', 'long'],
  ['cocoa', '☕', 'Make hot cocoa and play a game', 'cook', 'winter'],
  ['lemonade', '🍋', 'Make lemonade from scratch', 'cook', 'summer'],
  ['pizza', '🍕', 'Make your own pizzas, everyone picks a topping', 'cook', 'long'],
];
export const KIND_NAMES = { out: 'Outside', read: 'Reading', music: 'Music', games: 'Games', people: 'Friends and family', help: 'Helping out', make: 'Making things', cook: 'Cooking', own: 'Our idea' };

const SNOW = [71, 73, 75, 77, 85, 86]; const WET = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99];
const pad = (n) => String(n).padStart(2, '0');
export const seedOf = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
// Northern seasons by month; the southern half of the world gets them the other way round.
export function seasonOf(ymd, lat) { const m = (+ymd.slice(5, 7) - 1 + (lat < 0 ? 6 : 0)) % 12; return m <= 1 || m === 11 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'fall'; }
export const weekendOf = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); const wd = new Date(y, m - 1, d).getDay(); return wd === 0 || wd === 6; };
// What today's weather allows. Without a forecast, ordinary outdoor ideas are fine, the weather-specific ones aren't.
export function skyOf(weather, today, units) {
  const d = weather?.days?.find((x) => x.date === today); if (!d) return null;
  const f = (t) => (units === 'celsius' ? t * 9 / 5 + 32 : t); const high = f(d.high); const codes = [d.code, weather.current?.code];
  const snow = codes.some((c) => SNOW.includes(c)); const wet = !snow && (codes.some((c) => WET.includes(c)) || d.rainPct >= 60);
  return { snow, wet, high, out: !snow && !wet && high >= 35 && high <= 95, warm: !wet && !snow && high >= 68 && high <= 95 };
}
function fits(needs, { season, weekend, sky }) {
  for (const n of String(needs || '').split(' ').filter(Boolean)) {
    if (['spring', 'summer', 'fall', 'winter'].includes(n)) { if (n !== season) return false; continue; }
    if (n === 'long') { if (!weekend) return false; continue; }
    if (n === 'out') { if (sky && !sky.out) return false; continue; }
    if (n === 'warm') { if (!sky?.warm && !(sky === null && season === 'summer')) return false; continue; }
    if (n === 'wet') { if (!sky?.wet || sky.high < 45) return false; continue; }
    if (n === 'snow') { if (!sky?.snow) return false; continue; }
  }
  return true;
}
// Built-in ideas that fit today, plus the family's own (twice, so theirs come up more often).
export function ideaPool({ today, weather, units, lat, own = [], builtIn = true }) {
  const ctx = { season: seasonOf(today, lat ?? 40), weekend: weekendOf(today), sky: skyOf(weather, today, units) };
  const mine = (own || []).filter((x) => x && String(x.text || '').trim()).map((x, i) => ({ id: 'own-' + (x.id || i), emoji: x.emoji || '💛', text: String(x.text).trim(), kind: 'own', needs: x.out ? 'out' : '' })).filter((x) => fits(x.needs, ctx));
  const base = builtIn ? IDEAS.map(([id, emoji, text, kind, needs]) => ({ id, emoji, text, kind, needs })).filter((x) => fits(x.needs, ctx)) : [];
  return [...mine, ...base, ...mine];
}
// Today's idea: a day-seeded shuffle, so every screen shows the same one and each day starts somewhere new.
// "Another idea" moves one along. Ideas the family did in the last 10 days sit out, when there are enough others.
export function ideaOfDay({ today, weather, units, lat, own, builtIn, skip = 0, log = [] }) {
  const pool = ideaPool({ today, weather, units, lat, own, builtIn }); if (!pool.length) return null;
  const since = (() => { const [y, m, d] = today.split('-').map(Number); const t = new Date(y, m - 1, d - 10); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; })();
  const recent = new Set((log || []).filter((x) => x.date >= since && x.date < today).map((x) => x.id));
  const fresh = pool.filter((x) => !recent.has(x.id)); const list = fresh.length >= 3 ? fresh : pool;
  const seed = seedOf(today); const order = list.map((x, i) => [seedOf(seed + ':' + x.id + ':' + i), x]).sort((a, c) => a[0] - c[0]).map(([, x]) => x);
  // Two ideas in a row of the same kind feel like the same idea, so "Another idea" skips ahead to a new kind.
  const out = []; for (const x of order) { if (out.length && out[out.length - 1].kind === x.kind && order.some((y) => !out.includes(y) && y.kind !== x.kind && y !== x)) continue; out.push(x); }
  const seq = [...out, ...order.filter((x) => !out.includes(x))];
  return seq[((skip % seq.length) + seq.length) % seq.length];
}
// The ideas the family has done lately, for the mascot to cheer about.
export const doneThisWeek = (log = [], weekStart) => (log || []).filter((x) => x.date >= weekStart).length;

// "Go play!": counts how long someone has been tapping without anything getting done. A gap of 90 seconds with
// no taps starts a fresh count; ticking a chore, claiming a quest, adding groceries and the like start it over too.
export const PLAY_GAP = 90 * 1000;
export function playWatch(gap = PLAY_GAP) {
  let start = 0, last = 0;
  return {
    tap(t) { if (!last || t - last > gap) start = t; last = t; },
    did(t) { start = t; },
    reset() { start = 0; last = 0; },
    due(t, minutes) { return !!last && t - last <= gap && minutes > 0 && t - start >= minutes * 60000; },
    get start() { return start; },
  };
}
// What the board's own POSTs mean: changing the look of an avatar (or asking for another idea) is play; almost
// everything else, like a chore, a quest, a grocery item or a dinner, is something done.
export const isPlayOnly = (path, body) => /^\/api\/(wardrobe\/|kids-done)/.test(path) || (path === '/api/idea' && body?.action === 'next');

// What the mascot says when it sends everyone off. Before school it's "get ready", after school with jobs left
// it's "jobs first", near bedtime it's "wind down", and otherwise it's "go play" with today's idea.
export function goPlayWords({ kids = [], isSchoolDay, now, sleepFrom, idea, pet }) {
  const mins = now.getHours() * 60 + now.getMinutes(); const hm = (s) => { const [h, m] = String(s || '').split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
  const mine = (k) => (k.today || []).filter((t) => !t.doneByOther && !t.done);
  const hi = pet ? `${pet} here! ` : '';
  const bed = hm(sleepFrom); if (bed != null && bed - mins >= 0 && bed - mins <= 60) return { title: 'Time to wind down 🌙', text: `${hi}The board is resting now. How about a story together before bed?` };
  const morning = isSchoolDay && kids.some((k) => { const l = hm(k.leaveTime); return l != null && mins < l && l - mins <= 120; });
  const before = morning ? kids.filter((k) => mine(k).some((t) => t.when === 'morning')) : [];
  if (morning) return { title: 'Screen break! 🎒', text: before.length ? `${hi}Let’s get ready for school. ${list(before.map((k) => `${k.name} has ${count(mine(k).filter((t) => t.when === 'morning').length, 'thing')} to do`))}.` : `${hi}You’re all ready for school. Grab your bag and have a great day!` };
  const left = kids.filter((k) => mine(k).length);
  if (left.length) return { title: 'Jobs first, then go play! 💪', text: `${hi}${list(left.map((k) => `${k.name} has ${count(mine(k).length, 'job')} left`))}. Then${idea ? `: ${idea.emoji} ${lower(idea.text)}` : ' go play'}!` };
  return { title: 'Time to go play! 🌳', text: idea ? `${hi}Screens off. Today’s family idea: ${idea.emoji} ${lower(idea.text)}.` : `${hi}Screens off. Go play outside, read a book or make something!` };
}
// The "Time's up!" moment that opens a break: a kind, playful nudge to stop and think, never a telling-off.
// Short enough for a 7-year-old to read. The wording changes from break to break.
export const TIMES_UP = [
  (n) => `You’ve been tapping for ${n}. Did that get a job done?`,
  (n) => `Whoa, ${n} of tapping! What did it get done?`,
  (n) => `${n} went by. Was that the best thing to do right now?`,
  (n) => `Hmm, ${n} of tapping. Is it time for something better?`,
  (n) => `${n} of tapping, and no jobs ticked off yet. Let’s fix that!`,
];
export function timesUpWords({ minutes = 5, kids = [], seed = 0 }) {
  const n = count(Math.max(1, Math.round(minutes)), 'minute');
  const left = kids.map((k) => [k.name, (k.today || []).filter((t) => !t.doneByOther && !t.done).length]).filter(([, c]) => c > 0);
  const hint = left.length === 1 ? `${left[0][0]} still has ${count(left[0][1], 'job')} to do.`
    : left.length ? `${list(left.map(([name, c], i) => (i ? `${name} has ${c}` : `${name} has ${count(c, 'job')} left`)))}.`
    : 'All the jobs are done, so let’s go do something fun together!';
  return { title: 'Time’s up! ⏰', text: TIMES_UP[Math.abs(seed | 0) % TIMES_UP.length](n).replace(/^./, (c) => c.toUpperCase()), hint };
}
const count = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const list = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
