// First-run setup: a grown-up tells the board about their crew, their town, their plans and a few chores.
// Also runs again from Parents → Advanced → PIN and setup. It edits the same config the Parents screen edits, and saves after every step.
// Kids make their own avatars afterwards, in kids.js.
import { useState, useEffect, useRef } from 'https://cdn.jsdelivr.net/npm/preact@11.2.0/hooks/+esm';
import { html, api, put, toast, chime, confetti, andList, WordsBox } from './app.js';

const COLORS = ['#ff7a90', '#5aa9ff', '#ffc857', '#7fd6b0', '#c3a6ff', '#ff9f5a', '#4cc9c0', '#f28ad8'];
const WEEKDAYS = [1, 2, 3, 4, 5]; const EVERY = [0, 1, 2, 3, 4, 5, 6];
import { PETS, CHARACTERS } from './sidekicks.js';
export { PETS, CHARACTERS };
const sideEmoji = (kind) => [...PETS, ...CHARACTERS].find((x) => x[0] === kind)?.[1] || '';
const isPet = (kind) => PETS.some((x) => x[0] === kind);
// A few chores to start with. Families add their own.
const IDEAS = [
  { title: 'Make your bed', emoji: '🛏️', when: 'morning' }, { title: 'Brush teeth', emoji: '🪥', when: 'morning' },
  { title: 'Pack your backpack', emoji: '🎒', when: 'morning' }, { title: 'Homework or reading', emoji: '📚', when: 'after', timerMin: 20 },
  { title: 'Set the table', emoji: '🍴', when: 'after', who: 'either', rotate: true, days: EVERY }, { title: 'Tidy your room', emoji: '🧺', when: 'after', days: [6], stars: 3 },
];
// Typing a chore suggests its emoji. Anything unmatched gets a star.
const EMOJI_WORDS = [[/bed/, '🛏️'], [/teeth|brush/, '🪥'], [/dress|clothes/, '👕'], [/backpack|bag/, '🎒'], [/lunch/, '🥪'], [/breakfast|cereal/, '🥣'], [/homework|read|book|study/, '📚'],
  [/piano|music|instrument|practice|violin|guitar/, '🎵'], [/table/, '🍴'], [/dish|plate/, '🍽️'], [/laundry|clothes|fold/, '👚'], [/tidy|clean|room|toys/, '🧺'], [/trash|garbage/, '🗑️'], [/recycl/, '♻️'],
  [/dog|walk/, '🐕'], [/cat|litter/, '🐈'], [/feed|pet/, '🐾'], [/plant|water|garden/, '🌱'], [/shower|bath/, '🛁'], [/hair/, '💇'], [/shoes/, '👟'], [/vacuum|sweep|mop/, '🧹'], [/cook|dinner|help/, '🍳'], [/sport|soccer|ball/, '⚽'], [/pray|thank/, '🙏'], [/bike/, '🚲'], [/screen|tablet|phone/, '📵'], [/vitamin|medicine/, '💊']];
const EMOJI_GRID = ['⭐', '🛏️', '🪥', '👕', '🎒', '🥪', '🥣', '📚', '🎵', '🍴', '🍽️', '👚', '🧺', '🧹', '🗑️', '♻️', '🐕', '🐈', '🐾', '🌱', '🛁', '👟', '🍳', '⚽', '🚲', '🎨', '💪', '🙏', '🧸', '🚗', '💊', '📵'];
const guessEmoji = (t) => EMOJI_WORDS.find(([re]) => re.test(t.toLowerCase()))?.[1] || '⭐';
const WX = (code) => code === 0 ? '☀️' : code <= 2 ? '🌤️' : code === 3 ? '☁️' : code <= 48 ? '🌫️' : code <= 67 ? '🌧️' : code <= 77 ? '❄️' : code <= 82 ? '🌦️' : code <= 86 ? '🌨️' : '⛈️';
const slug = (s, taken) => { let b = String(s || 'kid').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '').slice(0, 16) || 'kid'; let id = b, n = 2; while (taken.includes(id)) id = b + n++; return id; };
const shortName = (n) => String(n || '').trim().replace(/^the\s+/i, '');
let wxNow = null; // today's weather from the Home step, shown again on the last screen

// A brand-new board starts with empty names (with examples as hints), no chores and no allowance, rather than made-up things to erase.
function blankStart(x) {
  const n = structuredClone(x); if (n.family.name === 'Our Family') n.family.name = '';
  try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; if (tz && n.weather.lat == null) n.zone = tz; } catch {} // until they pick a town, use this device's time zone
  n.family.parents = n.family.parents.map((p, i) => (['Mom', 'Dad'].includes(p.name) && !(i === 0 && n.setup?.fresh) ? { ...p, name: '', match: [] } : p)); // keep the name a new family signed up with
  if (n.kids.map((k) => k.name).join() === 'Alex,Sam') n.kids = [{ ...n.kids[0], name: '', weeklyAllowance: 0 }];
  if (n.setup?.fresh) n.tasks = [];
  return n;
}
const STEPS = ['Family', 'Grown-ups', 'Kids', 'Sidekick', 'Home', 'Calendars', 'Chores', 'Secret code', 'Ready'];
const LAST = STEPS.length - 1;

export function Setup({ b, pin, onDone }) {
  const rerun = !!b.auth?.enabled && !b.config?.setup?.fresh; // a family that already has sign-in is running setup again (a family that just signed up is not)
  const [c, setC] = useState(null); const [step, setStep] = useState(0); const [busy, setBusy] = useState(false); const [calMode, setCalMode] = useState(null);
  useEffect(() => { api('/api/admin/config', undefined, pin).then((x) => setC(rerun ? x : blankStart(x))).catch((e) => toast(e.message)); }, []);
  if (!c) return html`<div class="wiz"><div class="wizcard"><h2>Getting things ready…</h2></div></div>`;
  const edit = (fn) => setC((x) => { const n = structuredClone(x); fn(n); return n; });
  const save = async (n = c) => { setBusy(true); try { await put('/api/admin/config', { config: n }, pin); return true; } catch (e) { toast(e.message || 'Could not save'); return false; } finally { setBusy(false); } };
  const next = async () => {
    const n = tidy[step] ? tidy[step](structuredClone(c), calMode) : c; // drop rows left empty
    const problem = check[step]?.(n); if (problem) { toast(problem); chime('bad'); return; }
    setC(n); if (await save(n)) { chime('ok'); setStep(step + 1); document.querySelector('.wiz')?.scrollTo(0, 0); }
  };
  const back = () => setStep(Math.max(0, step - 1));
  const Body = [Family, Grownups, Kids, Sidekick, Home, Calendars, Chores, Code, Ready][step];
  return html`<div class="wiz"><div class="wizcard">
    ${step < LAST ? html`<div class="wizprog"><span>Step ${step + 1} of ${LAST}</span><i><b style=${{ width: Math.round((100 * (step + 1)) / LAST) + '%' }}></b></i></div>` : ''}
    ${step < LAST ? html`<${Stage} c=${c} />` : ''}
    <${Body} c=${c} edit=${edit} b=${b} pin=${pin} rerun=${rerun} save=${save} onDone=${onDone} setBusy=${setBusy} back=${back} calMode=${calMode} setCalMode=${setCalMode} goReady=${() => setStep(LAST)} />
    ${step < LAST - 1 ? html`<div class="wiznav">${step ? html`<button class="pill lite" onClick=${back}>‹ Back</button>` : html`<span></span>`}${rerun && step === 0 ? html`<button class="pill ghost" onClick=${async () => { const n = { ...c, setup: { ...(c.setup || {}), done: true } }; if (await save(n)) onDone(); }}>Cancel</button>` : ''}<button class="pill" disabled=${busy} onClick=${next}>${busy ? 'Saving…' : 'Next ›'}</button></div>` : ''}
  </div></div>`;
}

// Empty rows are dropped when moving on, so a spare blank never blocks anyone.
const tidy = {
  1: (n) => { n.family.parents = n.family.parents.filter((p) => p.name.trim()); return n; },
  2: (n) => { n.kids = n.kids.filter((k) => k.name.trim()); return n; },
  5: (n, mode) => { if (mode === 'shared') n.calendars = n.calendars.filter((x) => !x.owner || x.url); if (mode === 'each') { const f = n.calendars.find((x) => x.id === 'family'); if (f) f.url = ''; } return n; },
};
const check = {
  0: (c) => (!c.family.name.trim() ? 'Type your family name' : ''),
  1: (c) => (!c.family.parents.length ? 'Add yourself first' : ''),
  2: (c) => (!c.kids.length ? 'Add at least one kid' : ''),
  4: (c) => (c.weather.lat == null && !c.weather.skipped ? 'Pick your town from the list, or tap Skip' : ''),
};

// Everyone added so far, popping in as they're named.
function Stage({ c }) {
  const people = [...c.family.parents.map((p) => ({ ...p, grown: true })), ...c.kids].filter((x) => x.name.trim());
  const side = sideEmoji(c.family.petKind);
  if (!people.length && !side) return html`<div class="crew empty">Your crew will gather here ✨</div>`;
  return html`<div class="crew">${people.map((x) => html`<div class=${'stg' + (x.grown ? ' big' : '')} key=${x.id}><b style=${{ background: x.color }}>${x.name.trim()[0].toUpperCase()}</b><small>${x.name}</small></div>`)}
    ${side ? html`<div class="stg side" key=${'side' + c.family.petKind}><b>${side}</b><small>${c.family.dog || ''}</small></div>` : ''}</div>`;
}

function ColorDots({ value, onPick }) {
  return html`<div class="cdots">${COLORS.map((x) => html`<button class=${x === value ? 'on' : ''} style=${{ background: x }} aria-label="Color" onClick=${() => onPick(x)}></button>`)}</div>`;
}

function Family({ c, edit, rerun }) {
  const fam = shortName(c.family.name);
  return html`<h2>${rerun ? 'Let’s freshen things up' : 'Let’s get your family organized! 👋'}</h2>
    <p class="wizp">${rerun ? 'Walk through the basics again. Changes save as you go, and your chores, stars and history stay put.' : 'A few quick questions and your board will be ready. It takes about five minutes.'}</p>
    <div class="wizf"><label>Who are we organizing?</label><input class="gbox" autofocus value=${c.family.name} placeholder="The Riveras" onInput=${(e) => edit((n) => { n.family.name = e.target.value; })} /></div>
    <div class="bubble-say"><span>☀️</span>Good morning${fam ? ', ' + fam : ''}! Here’s your day.</div>`;
}

function Grownups({ c, edit }) {
  const ps = c.family.parents;
  return html`<h2>Who keeps the ruckus under control?</h2><p class="wizp">Add yourself and any other grown-ups in the house. Use the names the kids call you, so the board can say “Ask Mom” or “Dad’s picking you up.”</p>
    ${ps.map((p, i) => html`<div class="wizrow"><div class="wizcol"><input class="gbox" value=${p.name} placeholder=${i === 0 ? 'What the kids call you, like Mom' : 'Like Dad, Papa or Grandma'} onInput=${(e) => edit((n) => { const q = n.family.parents[i]; const old = q.name; q.name = e.target.value; q.match = [...new Set([q.name, ...(q.match || []).filter((w) => w !== old)].filter(Boolean))]; })} />
      <${ColorDots} value=${p.color} onPick=${(x) => edit((n) => { n.family.parents[i].color = x; })} /></div>
      ${ps.length > 1 ? html`<button class="xbtn" aria-label="Remove" onClick=${() => edit((n) => { n.family.parents.splice(i, 1); })}>×</button>` : ''}</div>`)}
    ${ps.length < 4 ? html`<button class="pill lite" onClick=${() => edit((n) => { const id = slug('parent' + (n.family.parents.length + 1), n.family.parents.map((x) => x.id)); n.family.parents.push({ id, name: '', match: [], color: COLORS[(n.family.parents.length + 4) % COLORS.length] }); })}>+ Add another grown-up</button>` : ''}`;
}

function Kids({ c, edit }) {
  return html`<h2>Who’s in the ruckus? 🎈</h2><p class="wizp">Add each kid. Their age helps us suggest chores that fit.</p>
    ${c.kids.map((k, i) => { const school = k.leaveTime !== ''; const paid = (k.weeklyAllowance || 0) > 0; const set = (fn) => edit((n) => fn(n.kids[i]));
      return html`<div class="wizrow"><div class="wizcol">
        <div class="wizinline"><input class="gbox" style="flex:1" value=${k.name} placeholder=${i === 0 ? 'First kid’s name' : 'Name'} onInput=${(e) => set((x) => { x.name = e.target.value; })} />
          <label class="agebox">Age <input type="number" min="1" max="18" value=${k.age || ''} onInput=${(e) => set((x) => { x.age = +e.target.value || null; })} /></label></div>
        <${ColorDots} value=${k.color} onPick=${(v) => set((x) => { x.color = v; })} />
        <div class="kidq"><span>🏫 On school days</span><div class="chips"><button class=${school ? 'on' : ''} onClick=${() => set((x) => { if (!x.leaveTime) x.leaveTime = '07:45'; })}>Leaves the house</button><button class=${!school ? 'on' : ''} onClick=${() => set((x) => { x.leaveTime = ''; })}>No school run</button></div>
          ${school ? html`<label class="inl">at <input type="time" value=${k.leaveTime} onInput=${(e) => set((x) => { x.leaveTime = e.target.value; })} /></label><small>The board counts down so nobody’s late.</small>` : ''}</div>
        <div class="kidq"><span>💰 Allowance</span><div class="chips"><button class=${paid ? 'on' : ''} onClick=${() => set((x) => { if (!x.weeklyAllowance) x.weeklyAllowance = 5; })}>Earns one</button><button class=${!paid ? 'on' : ''} onClick=${() => set((x) => { x.weeklyAllowance = 0; })}>Not yet</button></div>
          ${paid ? html`<label class="inl">$ <input type="number" min="0" step="0.5" value=${k.weeklyAllowance} onInput=${(e) => set((x) => { x.weeklyAllowance = +e.target.value || 0; })} /> a week</label><small>Stars from chores add up toward it.</small>` : ''}</div>
      </div>${c.kids.length > 1 ? html`<button class="xbtn" aria-label="Remove" onClick=${() => edit((n) => { n.kids.splice(i, 1); })}>×</button>` : ''}</div>`; })}
    ${c.kids.length < 6 ? html`<button class="pill lite" onClick=${() => edit((n) => { const id = slug('kid' + (n.kids.length + 1), n.kids.map((x) => x.id)); const k0 = n.kids[0] || {}; n.kids.push({ id, name: '', color: COLORS[n.kids.length % COLORS.length], age: null, leaveTime: k0.leaveTime ?? '07:45', weeklyAllowance: k0.weeklyAllowance || 0, morningStart: '06:30', avatar: { hair: ['short01', 'long16', 'short09', 'long05'][n.kids.length % 4], hairColor: '6a4e35', skinColor: 'f2d3b1', eyes: 'variant26', mouth: 'variant26' } }); })}>+ Add another kid</button>` : ''}`;
}

function Sidekick({ c, edit }) {
  const kind = c.family.petKind ?? (c.family.dog ? 'dog' : ''); const char = CHARACTERS.find((x) => x[0] === kind);
  const pick = (k, dflt) => edit((n) => { const wasChar = CHARACTERS.some((x) => x[0] === n.family.petKind && x[3] === n.family.dog); n.family.petKind = k; if (dflt) { if (!n.family.dog || wasChar) n.family.dog = dflt; } else if (wasChar) n.family.dog = ''; });
  const kids = andList(c.kids.map((k) => k.name));
  return html`<h2>Pick your family’s sidekick 🐾</h2><p class="wizp">Your sidekick says good morning, cheers the kids on and reminds them what’s next. Lots of families pick their pet, but it can be anything.</p>
    <div class="wizf"><label>Our pet</label><div class="sidepick">${PETS.map(([k, e, l]) => html`<button class=${kind === k ? 'on' : ''} onClick=${() => pick(k)}><span>${e}</span>${l}</button>`)}</div></div>
    <div class="wizf"><label>Or a character</label><div class="sidepick">${CHARACTERS.map(([k, e, l, d]) => html`<button class=${kind === k ? 'on' : ''} onClick=${() => pick(k, d)}><span>${e}</span>${l}</button>`)}</div></div>
    ${kind ? html`<div class="wizf"><label>What’s their name?</label><input class="gbox" value=${c.family.dog} placeholder=${char ? char[3] : 'Biscuit'} onInput=${(e) => edit((n) => { n.family.dog = e.target.value; })} /></div>
      <div class="bubble-say pop" key=${kind}><span>${sideEmoji(kind)}</span>${kind === 'dog' ? 'Woof! ' : kind === 'cat' ? 'Meow! ' : ''}Good morning${kids ? ', ' + kids : ''}! ${c.family.dog ? `It’s ${c.family.dog}. ` : ''}Let’s have a great day!</div>` : ''}`;
}

function Home({ c, edit }) {
  const [q, setQ] = useState(c.weather.place || ''); const [res, setRes] = useState(null); const [wx, setWx] = useState(wxNow); const timer = useRef(0); const picked = useRef(c.weather.place || '');
  const getWx = async (lat, lon, units) => { try { const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&temperature_unit=${units === 'celsius' ? 'celsius' : 'fahrenheit'}&timezone=auto&forecast_days=1`).then((x) => x.json()); wxNow = { t: Math.round(r.current.temperature_2m), code: r.current.weather_code, hi: Math.round(r.daily.temperature_2m_max[0]), lo: Math.round(r.daily.temperature_2m_min[0]) }; setWx(wxNow); } catch {} };
  useEffect(() => { if (c.weather.lat != null && !wx) getWx(c.weather.lat, c.weather.lon, c.weather.units); }, []);
  const type = (v) => { setQ(v); clearTimeout(timer.current); if (v.trim().length < 2 || v === picked.current) { setRes(null); return; }
    timer.current = setTimeout(async () => { try { const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=${encodeURIComponent(v.trim())}`).then((x) => x.json()); setRes(r.results || []); } catch { toast('Could not search right now'); } }, 250); };
  const choose = (r) => { const label = [r.name, r.admin1].filter(Boolean).join(', '); picked.current = label; setQ(label); setRes(null);
    edit((n) => { n.weather.lat = r.latitude; n.weather.lon = r.longitude; delete n.weather.skipped; n.weather.place = r.name; if (r.timezone) n.zone = r.timezone; }); chime('ok'); getWx(r.latitude, r.longitude, c.weather.units); };
  const units = (u) => { edit((n) => { n.weather.units = u; }); if (c.weather.lat != null) getWx(c.weather.lat, c.weather.lon, u); };
  return html`<h2>Where’s home? 🏡</h2><p class="wizp">For your weather and clock.</p>
    <div class="wizf"><label>Start typing your town, then pick it from the list</label><input class="gbox" value=${q} placeholder="Like Columbus" autocomplete="off" onInput=${(e) => type(e.target.value)} />
    ${res ? html`<div class="wizlist">${res.length ? res.map((r) => html`<button onClick=${() => choose(r)}><b>${r.name}</b> ${[r.admin1, r.country].filter(Boolean).join(', ')}</button>`) : html`<p class="wizp">No towns found yet. Keep typing, or try a nearby bigger town.</p>`}</div>` : ''}</div>
    ${c.weather.lat != null && wx ? html`<div class="wxcard pop" key=${c.weather.place}><span>${WX(wx.code)}</span><div><b>${wx.t}° in ${c.weather.place} right now</b><small>Today’s high ${wx.hi}°, low ${wx.lo}°. Time zone ${c.zone.replace(/_/g, ' ')}.</small></div></div>` : ''}
    <div class="wizf"><label>Temperatures in</label><div class="chips big"><button class=${c.weather.units !== 'celsius' ? 'on' : ''} onClick=${() => units('fahrenheit')}>°F</button><button class=${c.weather.units === 'celsius' ? 'on' : ''} onClick=${() => units('celsius')}>°C</button></div></div>
    ${c.weather.lat == null ? html`<button class="pill ghost sm" style="margin-top:4px;align-self:flex-start" onClick=${() => edit((n) => { n.weather.skipped = true; })}>${c.weather.skipped ? '✓ Skipping the weather for now' : 'Skip the weather for now'}</button>` : ''}`;
}

// Paste a link, check it, and see a real event from it.
function CalLink({ url, onUrl, pin, placeholder }) {
  const [msg, setMsg] = useState(''); const [ok, setOk] = useState(false);
  const test = async () => { setMsg('Checking…'); setOk(false); try { const r = await api('/api/admin/test-calendar', { url: url.trim().replace(/^webcal:/i, 'https:') }, pin); setOk(true); setMsg(`Found ${r.events} event${r.events === 1 ? '' : 's'}!${r.next ? ` Next up: ${r.next.title}, ${r.next.when}` : ''}`); chime('win'); } catch (e) { setMsg(e.message || 'That link didn’t work. Check you copied all of it.'); } };
  return html`<div class="callink"><div class="wizinline"><input class="gbox" style="flex:1" value=${url} placeholder=${placeholder} onInput=${(e) => { setMsg(''); onUrl(e.target.value.trim().replace(/^webcal:/i, 'https:')); }} /><button class="pill" disabled=${!url.trim()} onClick=${test}>Check it</button></div>
    ${msg ? html`<p class=${ok ? 'wizok pop' : 'wizp'}>${ok ? '🎉 ' : ''}${msg}</p>` : ''}</div>`;
}

function Calendars({ c, edit, pin, calMode, setCalMode }) {
  const people = [...c.family.parents, ...c.kids];
  const hasOwn = c.calendars.some((x) => x.owner && x.url); const hasShared = !!c.calendars.find((x) => x.id === 'family')?.url;
  const mode = calMode || (hasOwn && hasShared ? 'both' : hasOwn ? 'each' : 'shared');
  const fam = c.calendars.find((x) => x.id === 'family');
  const setFam = (v) => edit((n) => { let f = n.calendars.find((x) => x.id === 'family'); if (!f) { f = { id: 'family', name: 'Family', color: '#1f3a5f', owner: null, enabled: true }; n.calendars.unshift(f); } f.url = v; });
  const own = (p) => c.calendars.find((x) => x.owner === p.id);
  const setOwn = (p, v) => edit((n) => { let x = n.calendars.find((y) => y.owner === p.id); if (!x) { x = { id: 'own-' + p.id, name: p.name, color: p.color, owner: p.id, enabled: true }; n.calendars.push(x); } x.url = v; x.name = p.name; x.color = p.color; });
  const words = (p) => (p.match || []).filter((w) => w.toLowerCase() !== p.name.toLowerCase());
  const setWords = (p, v) => edit((n) => { const q = [...n.family.parents, ...n.kids].find((x) => x.id === p.id); q.match = [...new Set([q.name, ...v])]; });
  const choice = (m, e, t, s) => html`<button class=${'choice' + (mode === m ? ' on' : '')} onClick=${() => setCalMode(m)}><span>${e}</span><b>${t}</b><small>${s}</small></button>`;
  return html`<h2>How does your family keep track of plans? 📅</h2><p class="wizp">Connect your calendar and everyone’s events show up on the board, in their own color. No calendar yet? Tap Next and add one later.</p>
    <div class="choices">${choice('shared', '👨‍👩‍👧', 'One family calendar', 'We all put plans on the same one')}${choice('each', '🙋', 'Each of us has our own', 'Mom’s, Dad’s, maybe the kids’ too')}${choice('both', '✨', 'Both', 'A family one, plus our own')}</div>
    ${mode !== 'each' ? html`<div class="wizf"><label>Your family calendar’s link</label><${CalLink} url=${fam?.url || ''} onUrl=${setFam} pin=${pin} placeholder="Paste the link here" /></div>` : ''}
    ${mode !== 'shared' ? html`<div class="wizf"><label>Each person’s calendar link (skip anyone who doesn’t have one)</label>${people.map((p) => html`<div class="perscal"><span class="pdot" style=${{ background: p.color }}>${p.name[0]}</span><b>${p.name}</b><${CalLink} url=${own(p)?.url || ''} onUrl=${(v) => setOwn(p, v)} pin=${pin} placeholder=${`${p.name}’s calendar link`} /></div>`)}
      <p class="wizp">Everything on ${people[0]?.name || 'someone'}’s calendar shows in ${people[0]?.name || 'their'}’s color.</p></div>` : ''}
    <details class="wizhelp"><summary>Where do I find my calendar’s link?</summary>
      <p><b>Google Calendar</b>: on a computer, open Settings, click the calendar on the left, scroll to “Integrate calendar” and copy “Secret address in iCal format”.</p>
      <p><b>iPhone or iCloud</b>: in the Calendar app, tap Calendars, tap ⓘ next to the calendar, turn on “Public Calendar” and copy the link.</p>
      <p><b>Outlook</b>: Settings, Calendar, Shared calendars, “Publish a calendar”, then copy the ICS link.</p>
      <p>Keep the link private. Anyone who has it can see the calendar.</p></details>
    ${mode !== 'each' ? html`<div class="wizf"><label>Whose events are whose?</label><p class="wizp" style="margin-top:0">On a shared calendar, we spot each person’s name in an event, like “${c.kids[0]?.name || 'Maya'} soccer”, and color it for them. Add other words that mean them, like a nickname or their activities.</p>
      ${people.map((p) => html`<div class="perscal"><span class="pdot" style=${{ background: p.color }}>${p.name[0]}</span><b>${p.name}</b><${WordsBox} class="gbox sm" style="flex:1" words=${words(p)} placeholder=${p.grown === undefined && c.kids.includes(p) ? 'Like soccer, piano, Scouts' : 'Like your first name, book club'} onWords=${(v) => setWords(p, v)} /></div>`)}</div>` : ''}`;
}

function Chores({ c, edit }) {
  const pet = isPet(c.family.petKind) && c.family.dog; const [title, setTitle] = useState(''); const [emoji, setEmoji] = useState(''); const [grid, setGrid] = useState(null);
  const ideas = [...IDEAS, ...(pet ? [{ title: `Feed ${pet}`, emoji: '🐾', when: 'morning', who: 'either', rotate: true, days: EVERY }] : [])];
  const has = (t) => c.tasks.some((x) => x.title.toLowerCase() === t.toLowerCase());
  const add = (idea) => edit((n) => { if (n.tasks.some((x) => x.title.toLowerCase() === idea.title.toLowerCase())) return; n.tasks.push({ id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), title: idea.title, emoji: idea.emoji, who: c.kids.length > 1 ? idea.who || 'both' : c.kids[0].id, rotate: c.kids.length > 1 && !!idea.rotate, when: idea.when, days: idea.days || WEEKDAYS, stars: idea.stars || 1, ...(idea.timerMin ? { timerMin: idea.timerMin } : {}) }); });
  const addOwn = () => { const t = title.trim(); if (!t) return; add({ title: t, emoji: emoji || guessEmoji(t), when: new Date().getHours() < 12 ? 'morning' : 'after' }); setTitle(''); setEmoji(''); chime('ok'); };
  const paid = c.kids.some((k) => (k.weeklyAllowance || 0) > 0);
  return html`<h2>What does the crew help with? 🧹</h2><p class="wizp">Start small, you can always add more. Kids earn a star for each one they tick off.</p>
    <div class="wizf"><label>Tap to add</label><div class="ideas">${ideas.filter((x) => !has(x.title)).map((x) => html`<button onClick=${() => { add(x); chime('ok'); }}>${x.emoji} ${x.title} <b>+</b></button>`)}</div></div>
    <div class="wizf"><label>Or add your own</label><div class="wizinline addown"><button class="emojibtn" onClick=${() => setGrid(grid === 'new' ? null : 'new')}>${emoji || (title.trim() ? guessEmoji(title) : '⭐')}</button><input class="gbox" style="flex:1" value=${title} placeholder="Like Feed the fish" onInput=${(e) => setTitle(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && addOwn()} /><button class="pill" disabled=${!title.trim()} onClick=${addOwn}>Add</button></div>
      ${grid === 'new' ? html`<div class="emojigrid">${EMOJI_GRID.map((e) => html`<button onClick=${() => { setEmoji(e); setGrid(null); }}>${e}</button>`)}</div>` : ''}</div>
    ${c.tasks.length ? html`<div class="wizf"><label>Your chores</label>${c.tasks.map((t, i) => html`<div class="chorerow pop" key=${t.id}><button class="emojibtn" onClick=${() => setGrid(grid === t.id ? null : t.id)}>${t.emoji}</button><b>${t.title}</b>
        <div class="chips"><button class=${t.when === 'morning' ? 'on' : ''} onClick=${() => edit((n) => { n.tasks[i].when = 'morning'; })}>☀️ Morning</button><button class=${t.when !== 'morning' ? 'on' : ''} onClick=${() => edit((n) => { n.tasks[i].when = 'after'; })}>🏡 After school</button></div>
        <button class="xbtn" aria-label="Remove" onClick=${() => edit((n) => { n.tasks.splice(i, 1); })}>×</button>
        ${grid === t.id ? html`<div class="emojigrid">${EMOJI_GRID.map((e) => html`<button onClick=${() => { edit((n) => { n.tasks[i].emoji = e; }); setGrid(null); }}>${e}</button>`)}</div>` : ''}</div>`)}</div>` : ''}
    ${paid ? html`<div class="wizf"><label>Pay day, when the allowance week ends</label><div class="chips big">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => html`<button class=${(Number.isInteger(c.week.payDay) ? c.week.payDay : 0) === i ? 'on' : ''} onClick=${() => edit((n) => { n.week.payDay = i; })}>${d}</button>`)}</div></div>` : ''}`;
}

function Code({ c, b, pin, rerun, setBusy, back, goReady }) {
  const [newPin, setNewPin] = useState(''); const [mode, setMode] = useState(b.auth?.google ? 'google' : 'password');
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [who, setWho] = useState(c.family.parents[0]?.id); const [display, setDisplay] = useState(null); const [working, setWorking] = useState(false);
  const hasAccount = !!b.auth?.enabled; // signed up on a shared site, or running setup again
  const pinOk = rerun ? !newPin || /^\d{4,8}$/.test(newPin) : /^\d{4,8}$/.test(newPin);
  const finish = async () => {
    if (!pinOk) { toast('Pick a code of 4 to 8 numbers'); chime('bad'); return; } if (!hasAccount && display === null) { toast('Pick which device this is'); return; }
    setWorking(true); setBusy(true);
    const n = structuredClone(c); if (newPin) n.pin = newPin; n.setup = { done: true, kidsTurn: rerun ? c.setup?.kidsTurn || [] : c.kids.map((k) => k.id) }; if (!n.week.startedOn) n.week.startedOn = b.today; const usePin = newPin || pin;
    try {
      await put('/api/admin/config', { config: n }, pin || usePin);
      await api('/api/admin/refresh', {}, usePin).catch(() => {});
      if (hasAccount) { goReady(); return; }
      if (mode === 'google') { const r = await api('/api/admin/setup-google', { personId: who, display }, usePin); location.href = r.url; return; }
      const r = await api('/api/admin/setup', { email, password: pw, personId: who, display }, usePin); sessionStorage.setItem('fb-recovery', r.recoveryCode); goReady();
    } catch (e) { toast(e.message || 'Something went wrong'); } finally { setWorking(false); setBusy(false); }
  };
  return html`<h2>One secret code for the grown-ups 🔐</h2>
    <p class="wizp">${rerun ? 'Want a new code? Type it here, or leave it blank to keep the one you have.' : 'Pick a code of 4 or more numbers. You’ll type it on the kitchen screen to approve stars and change settings, so the kids can’t approve their own. 😉'}</p>
    <input class="gbox pinbox" inputmode="numeric" maxlength="8" value=${newPin} placeholder="••••" onInput=${(e) => setNewPin(e.target.value.replace(/\D/g, ''))} />
    ${hasAccount ? '' : html`<div class="wizf"><label>Your sign-in. Only signed-in devices can open the board.</label>
      <div class="chips big">${c.family.parents.map((p) => html`<button class=${who === p.id ? 'on' : ''} onClick=${() => setWho(p.id)}>I’m ${p.name}</button>`)}</div>
      ${b.auth?.google ? html`<div class="chips big"><button class=${mode === 'google' ? 'on' : ''} onClick=${() => setMode('google')}>Continue with Google</button><button class=${mode === 'password' ? 'on' : ''} onClick=${() => setMode('password')}>Email and password</button></div>` : ''}
      ${mode === 'password' ? html`<input class="gbox" type="email" autocomplete="username" placeholder="Email" value=${email} onInput=${(e) => setEmail(e.target.value)} /><input class="gbox" type="password" autocomplete="new-password" placeholder="Password, at least 10 characters" value=${pw} onInput=${(e) => setPw(e.target.value)} />` : ''}
      <label>Which device are you holding right now?</label><div class="chips big"><button class=${display === true ? 'on' : ''} onClick=${() => setDisplay(true)}>🖥️ The shared family screen</button><button class=${display === false ? 'on' : ''} onClick=${() => setDisplay(false)}>📱 My own phone</button></div></div>`}
    <div class="wiznav"><button class="pill lite" onClick=${back}>‹ Back</button><button class="pill sun big" disabled=${working} onClick=${finish}>${working ? 'Finishing…' : rerun ? 'Save and finish ✨' : mode === 'google' && !hasAccount ? 'Finish with Google ✨' : 'Finish ✨'}</button></div>`;
}

// The big reveal: a peek at their board, then hand it to the kids.
function Ready({ c, b, rerun, onDone }) {
  useEffect(() => { confetti(); chime('win'); setTimeout(confetti, 700); }, []);
  const code = sessionStorage.getItem('fb-recovery'); const side = sideEmoji(c.family.petKind); const fam = shortName(c.family.name);
  const done = (kids) => { sessionStorage.removeItem('fb-recovery'); if (kids) { sessionStorage.setItem('fb-kids-now', '1'); location.reload(); } else onDone(); }; // the board picks up the kids' turn as it loads
  const chores = (k, when) => c.tasks.filter((t) => t.when === when && (t.who === 'both' || t.who === 'either' || t.who === k.id)).length;
  return html`<div class="ready"><h2>${rerun ? 'All set! ✨' : 'Your board is ready! 🎉'}</h2>
    <div class="peek pop"><div class="peekh"><b>Good morning, ${fam}!</b>${wxNow ? html`<span>${WX(wxNow.code)} ${wxNow.t}°</span>` : ''}</div>
      ${side ? html`<div class="peeks"><span>${side}</span>${c.family.dog ? c.family.dog + ' says: ' : ''}Let’s have a great day!</div>` : ''}
      <div class="peekk">${c.kids.map((k, i) => html`<div class="peekkid" style=${{ borderColor: k.color, animationDelay: i * 0.12 + 's' }}><b style=${{ background: k.color }}>${k.name[0]}</b><div><b>${k.name}</b><small>${chores(k, 'morning')} morning · ${chores(k, 'after')} after school${k.leaveTime ? ' · leaves ' + k.leaveTime : ''}</small></div></div>`)}</div></div>
    ${code ? html`<p class="wizp">Save this recovery code somewhere safe, like your password manager. It’s the way back in if you forget your password.</p><div class="wizcode">${code}</div>` : ''}
    ${rerun ? html`<button class="pill sun big" onClick=${() => done(false)}>Back to the board</button>` : html`
      <p class="wizp"><b>One last thing:</b> each kid makes their own avatar. Hand them the tablet now, or they’ll get their turn the first time the kitchen screen opens.</p>
      <div class="wiznav"><button class="pill lite" onClick=${() => done(false)}>Open our board</button><button class="pill sun big" onClick=${() => done(true)}>Kids, your turn! 🎨</button></div>`}</div>`;
}
