// Default configuration. Everything here is editable on the Parents screen and stored in D1.
// ---------- wardrobe ----------
// Every look in the DiceBear "adventurer" avatar set is free, so any kid can look like themself. Stars buy the fun extras.
const NAMED_HAIR = { long05: 'Bob', long15: 'Pigtails', long16: 'Braid', long07: 'Bangs', long13: 'Buns', long24: 'Curly', long23: 'Top bun',
  short01: 'Short', short04: 'Spiky', short09: 'Swoop', short13: 'Tousled', short19: 'Buzz', short16: 'Curly short' };
const STAR_HAIR = { long03: ['Flower crown', 15, 2], long08: ['Daisy crown', 15, 2], long18: ['Flower clip', 10, 0] };
const pad = (n) => String(n).padStart(2, '0');
const hair = [];
for (let i = 1; i <= 19; i++) { const v = 'short' + pad(i); hair.push({ id: 'h-' + v, kind: 'hair', label: NAMED_HAIR[v] || 'Short ' + i, value: v, cost: 0 }); }
for (let i = 1; i <= 26; i++) { const v = 'long' + pad(i); const st = STAR_HAIR[v];
  hair.push(st ? { id: 'h-' + v, kind: 'hair', label: st[0], value: v, cost: st[1], ...(st[2] ? { minLevel: st[2] } : {}) } : { id: 'h-' + v, kind: 'hair', label: NAMED_HAIR[v] || 'Long ' + i, value: v, cost: 0 }); }
const item = (id, kind, label, value, cost, more = {}) => ({ id, kind, label, value, cost, ...more });
const CATALOG = [
  ...hair,
  // hair colors: the natural ones are free, the bright ones cost stars
  item('c-black', 'hairColor', 'Black', '0e0e0e', 0), item('c-darkbrown', 'hairColor', 'Dark brown', '562306', 0), item('c-brown', 'hairColor', 'Brown', '6a4e35', 0),
  item('c-lightbrown', 'hairColor', 'Light brown', '796a45', 0), item('c-dirty', 'hairColor', 'Dirty blonde', '97804f', 0), item('c-golden', 'hairColor', 'Golden', 'b9a05f', 0),
  item('c-blonde', 'hairColor', 'Light blonde', 'e5d7a3', 0), item('c-auburn', 'hairColor', 'Auburn', 'ac6511', 0), item('c-ginger', 'hairColor', 'Ginger', 'cb6820', 0),
  item('c-red', 'hairColor', 'Red', 'ab2a18', 0), item('c-silver', 'hairColor', 'Silver', 'afafaf', 10),
  item('c-pink', 'hairColor', 'Pink hair', 'dba3be', 20, { minLevel: 4 }), item('c-blue', 'hairColor', 'Blue hair', '85c2c6', 20, { minLevel: 4 }),
  item('c-green', 'hairColor', 'Green hair', '3eac2c', 20, { minLevel: 4 }), item('c-plum', 'hairColor', 'Purple hair', '592454', 20, { minLevel: 4 }),
  // glasses and earrings: every style in the set
  item('g-01', 'glasses', 'Round glasses', 'variant01', 10), item('g-02', 'glasses', 'Square glasses', 'variant02', 10), item('g-03', 'glasses', 'Big glasses', 'variant03', 10),
  item('g-04', 'glasses', 'Thin glasses', 'variant04', 10), item('g-05', 'glasses', 'Cat-eye glasses', 'variant05', 12, { minLevel: 3 }),
  item('e-01', 'earrings', 'Studs', 'variant01', 6), item('e-02', 'earrings', 'Tiny hoops', 'variant02', 6), item('e-03', 'earrings', 'Hoops', 'variant03', 10),
  item('e-04', 'earrings', 'Drops', 'variant04', 10), item('e-05', 'earrings', 'Gems', 'variant05', 12), item('e-06', 'earrings', 'Dangly', 'variant06', 14, { minLevel: 3 }),
  // backgrounds
  item('b-mint', 'bg', 'Mint', 'd9f0e2', 0), item('b-sun', 'bg', 'Sunshine', 'fff3c4', 5), item('b-sky', 'bg', 'Sky', 'e6f4ff', 5), item('b-lilac', 'bg', 'Lilac', 'ece4ff', 8),
  item('b-peach', 'bg', 'Peach', 'ffe0d1', 5), item('b-coral', 'bg', 'Coral', 'ffc9c2', 8), item('b-lime', 'bg', 'Lime', 'e4f5b8', 8), item('b-navy', 'bg', 'Midnight', '2b3a67', 12),
  item('b-sunset', 'bg', 'Sunset', 'sunset', 15, { minLevel: 2 }), item('b-ocean', 'bg', 'Ocean', 'ocean', 15, { minLevel: 2 }), item('b-forest', 'bg', 'Forest', 'forest', 15, { minLevel: 2 }),
  item('b-candy', 'bg', 'Cotton candy', 'candy', 18, { minLevel: 3 }), item('b-galaxy', 'bg', 'Galaxy', 'galaxy', 25, { minLevel: 5 }), item('b-rainbow', 'bg', 'Rainbow', 'rainbow', 25, { minLevel: 5 }),
  // pets sit at the bottom right
  item('p-dog', 'pet', 'Puppy', '🐶', 0), item('p-cat', 'pet', 'Kitten', '🐱', 10), item('p-bunny', 'pet', 'Bunny', '🐰', 12), item('p-hamster', 'pet', 'Hamster', '🐹', 8),
  item('p-turtle', 'pet', 'Turtle', '🐢', 8), item('p-frog', 'pet', 'Frog', '🐸', 8), item('p-penguin', 'pet', 'Penguin', '🐧', 12), item('p-octopus', 'pet', 'Octopus', '🐙', 12),
  item('p-fox', 'pet', 'Fox', '🦊', 14), item('p-owl', 'pet', 'Owl', '🦉', 14), item('p-horse', 'pet', 'Pony', '🐴', 15), item('p-panda', 'pet', 'Panda', '🐼', 16),
  item('p-shark', 'pet', 'Shark', '🦈', 18, { minLevel: 3 }), item('p-trex', 'pet', 'T. rex', '🦖', 20, { minLevel: 3 }), item('p-unicorn', 'pet', 'Unicorn', '🦄', 30, { minLevel: 5 }),
  item('p-dragon', 'pet', 'Dragon', '🐉', 0, { prizeOnly: true }),
  // extras sit at the top left
  item('x-bow', 'extra', 'Big bow', '🎀', 6), item('x-sunflower', 'extra', 'Sunflower', '🌻', 6), item('x-butterfly', 'extra', 'Butterfly', '🦋', 8), item('x-cap', 'extra', 'Ball cap', '🧢', 8),
  item('x-star', 'extra', 'Star badge', '⭐', 10), item('x-tophat', 'extra', 'Top hat', '🎩', 10), item('x-rainbow', 'extra', 'Rainbow', '🌈', 10), item('x-lightning', 'extra', 'Lightning', '⚡', 10),
  item('x-planet', 'extra', 'Planet', '🪐', 14), item('x-shine', 'extra', 'Shining star', '🌟', 20, { minLevel: 4 }), item('x-gem', 'extra', 'Gem', '💎', 25, { minLevel: 5 }),
  item('x-crown', 'extra', 'Crown', '👑', 0, { minLevel: 5 }), item('x-wand', 'extra', 'Magic wand', '🪄', 0, { prizeOnly: true }), item('x-trophy', 'extra', 'Trophy', '🏆', 0, { prizeOnly: true }),
  // gear sits at the bottom left: the things a kid loves doing
  item('k-soccer', 'gear', 'Soccer ball', '⚽', 6), item('k-basket', 'gear', 'Basketball', '🏀', 6), item('k-football', 'gear', 'Football', '🏈', 6), item('k-baseball', 'gear', 'Baseball', '⚾', 6),
  item('k-tennis', 'gear', 'Tennis', '🎾', 6), item('k-books', 'gear', 'Books', '📚', 6), item('k-paint', 'gear', 'Paints', '🎨', 8), item('k-music', 'gear', 'Music', '🎵', 8),
  item('k-headphones', 'gear', 'Headphones', '🎧', 10), item('k-skate', 'gear', 'Skateboard', '🛹', 10), item('k-guitar', 'gear', 'Guitar', '🎸', 12), item('k-game', 'gear', 'Game controller', '🎮', 12),
  item('k-ballet', 'gear', 'Ballet shoes', '🩰', 12), item('k-telescope', 'gear', 'Telescope', '🔭', 14), item('k-rocket', 'gear', 'Rocket', '🚀', 15, { minLevel: 3 }),
];
// Boards saved before v2 kept older prices for looks that are free now. Only prices a parent never changed move to free.
export const WARDROBE_V2_FREE = { 'h-long07': 5, 'h-long13': 8, 'h-long24': 8, 'h-long23': 8, 'h-short13': 5, 'h-short16': 8, 'c-red': 15, 'c-blonde': 5 };

export default {
  version: 1,
  pin: '1234',
  zone: 'America/New_York',
  family: {
    name: 'Our Family',
    parents: [
      { id: 'parent1', name: 'Mom', match: ['Mom', 'Mommy'], color: '#c3a6ff' },
      { id: 'parent2', name: 'Dad', match: ['Dad', 'Daddy'], color: '#7fd6b0' },
    ],
    dog: '', petKind: '',
    groupWords: ['the kids', 'both kids', 'the girls', 'the boys', 'all kids'],
  },
  // mode: 'sun' turns dark at sunset and light at sunrise (from the weather's town), or 'light' / 'dark' always.
  theme: { mode: 'sun', navy: '#1f3a5f', leaf: '#2f8f5b', sun: '#ffc857', coral: '#ff7a90', sky: '#5aa9ff', lilac: '#c3a6ff', mint: '#7fd6b0' },
  calendars: [
    { id: 'family', name: 'Family', url: '', color: '#1f3a5f', owner: null, enabled: true },
  ],
  weather: { lat: null, lon: null, units: 'fahrenheit', place: '' },
  tips: [
    { when: 'snow', text: 'Boots and gloves' },
    { when: 'rainPct>=40', text: 'Umbrella day' },
    { when: 'high<40', text: 'Coat and hat' },
    { when: 'high<55', text: 'Jacket' },
    { when: 'high>80', text: 'Water bottle and sunscreen' },
  ],
  week: { startsOn: 1, closesAt: '18:00', payDay: 5 },
  school: { days: [1, 2, 3, 4, 5], daysOff: [], extraDays: [] },
  kids: [
    { id: 'kid1', name: 'Alex', color: '#ff7a90', age: 10, leaveTime: '07:45', weeklyAllowance: 5, morningStart: '06:30',
      avatar: { hair: 'long16', hairColor: '6a4e35', skinColor: 'f2d3b1', eyes: 'variant26', mouth: 'variant26', features: 'blush' } },
    { id: 'kid2', name: 'Sam', color: '#5aa9ff', age: 7, leaveTime: '07:45', weeklyAllowance: 5, morningStart: '06:30',
      avatar: { hair: 'long15', hairColor: '97804f', skinColor: 'f2d3b1', eyes: 'variant09', mouth: 'variant22', features: 'freckles' } },
  ],
  tasks: [
    { id: 't1', title: 'Make your bed', emoji: '🛏️', who: 'both', when: 'morning', days: [1,2,3,4,5], stars: 1 },
    { id: 't2', title: 'Brush teeth', emoji: '🪥', who: 'both', when: 'morning', days: [1,2,3,4,5], stars: 1 },
    { id: 't3', title: 'Get dressed', emoji: '👕', who: 'both', when: 'morning', days: [1,2,3,4,5], stars: 1 },
    { id: 't4', title: 'Pack your backpack', emoji: '🎒', who: 'both', when: 'morning', days: [1,2,3,4,5], stars: 1 },
    { id: 't6', title: 'Unpack backpack', emoji: '🎒', who: 'both', when: 'after', days: [1,2,3,4,5], stars: 1 },
    { id: 't7', title: 'Homework or reading', emoji: '📚', who: 'both', when: 'after', days: [1,2,3,4,5], stars: 1, timerMin: 20 },
    { id: 't10', title: 'Set the table', emoji: '🍴', who: 'either', rotate: true, when: 'after', days: [0,1,2,3,4,5,6], stars: 1 },
    { id: 't11', title: 'Clear the table', emoji: '🍽️', who: 'either', rotate: true, when: 'after', days: [0,1,2,3,4,5,6], stars: 1 },
    { id: 't12', title: 'Tidy your room', emoji: '🧺', who: 'both', when: 'after', days: [6], stars: 3 },
  ],
  quests: [
    { id: 'q1', title: 'Read 20 minutes', emoji: '📖', stars: 2, who: 'both' },
    { id: 'q2', title: 'Help cook dinner', emoji: '🍳', stars: 3, who: 'both' },
    { id: 'q3', title: 'Tidy the playroom', emoji: '🧹', stars: 3, who: 'both' },
    { id: 'q4', title: 'Water the plants', emoji: '🌱', stars: 2, who: 'both' },
    { id: 'q5', title: 'Help someone without being asked', emoji: '💛', stars: 1, who: 'both' },
  ],
  rewards: [
    { id: 'r1', title: '15 minutes extra screen time', emoji: '📺', cost: 10, who: 'both' },
    { id: 'r2', title: 'Pick tonight\'s dinner', emoji: '🍕', cost: 15, who: 'both' },
    { id: 'r3', title: 'Choose the family movie', emoji: '🎬', cost: 15, who: 'both' },
    { id: 'r4', title: 'Stay up 15 minutes late', emoji: '🌙', cost: 20, who: 'both' },
    { id: 'r5', title: 'Special one-on-one time with a grown-up', emoji: '💛', cost: 30, who: 'both' },
    { id: 'r6', title: 'Skip one chore', emoji: '🎟️', cost: 25, who: 'both' },
  ],
  // Brain quests: short quizzes for bonus stars. Each kid's level is kids[].quizGrade (1 to 8), set a grade up if they're ahead.
  quiz: { enabled: true, perWeek: 3, questions: 5, starsEach: 1, perfectBonus: 1, region: 'us' },
  photos: { onScreensaver: true, seconds: 20 },
  notify: { morningAt: '06:45' },
  prize: { title: 'Ice cream trip', emoji: '🍦', missesAllowed: 1, bonusStars: 8 },
  rules: { starsPerDollar: 10, roundTo: 0.25, morningGate: false, undoSeconds: 10, questsNeedApproval: true, levelStars: 100,
    levelNames: ['Sprout', 'Explorer', 'Adventurer', 'Captain', 'Champion', 'Legend', 'Superstar'] },
  places: [],
  countdowns: [],
  feedbackUrl: '',
  voice: { wake: 'Hey calendar', voiceName: '', rate: 1, pitch: 1, volume: 1, quietFrom: '20:30', quietTo: '06:30', speak: true, chime: true,
    kidsCan: ['check', 'claim', 'ask', 'grocery'], ai: false, aiModel: 'claude-haiku-5-5', language: 'en-US', handsFree: false, cloud: true, cloudVoice: 'thalia', wakeAlso: 'hey calender, a calendar, ok calendar, hey calendars' },
  ambient: { showWeek: true, idleMinutes: 2, sleepFrom: '21:00', sleepTo: '06:00', dimAtNight: true, morning: true },
  setup: { done: false },
  wardrobe: { v: 2, catalog: CATALOG },
};
