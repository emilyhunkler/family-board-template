// First-run setup: walks a new family from a blank board to their own people, calendar, weather and chores.
// Also runs again from Parents → Settings. It edits the same config the Parents screen edits, and saves after every step.
import { useState, useEffect } from 'https://cdn.jsdelivr.net/npm/preact@11.2.0/hooks/+esm';
import { html, api, put, toast, chime, confetti, Avatar } from './app.js';

const COLORS = ['#ff7a90', '#5aa9ff', '#ffc857', '#7fd6b0', '#c3a6ff', '#ff9f5a', '#4cc9c0', '#f28ad8'];
const HAIR = [['long16', 'Braid'], ['long15', 'Pigtails'], ['long05', 'Bob'], ['long07', 'Bangs'], ['long24', 'Curly'], ['long13', 'Buns'], ['long23', 'Top bun'], ['short01', 'Short'], ['short04', 'Spiky'], ['short09', 'Swoop'], ['short13', 'Tousled'], ['short19', 'Buzz']];
const HAIR_COLORS = [['0e0e0e', 'Black'], ['562306', 'Dark brown'], ['6a4e35', 'Brown'], ['97804f', 'Dirty blonde'], ['e5d7a3', 'Blonde'], ['ab2a18', 'Red']];
const SKIN = ['f2d3b1', 'ecad80', '9e5622', '763900'];
const PETS = [['', 'No pet'], ['dog', '🐶 Dog'], ['cat', '🐱 Cat'], ['bunny', '🐰 Bunny'], ['fish', '🐠 Fish'], ['bird', '🐦 Bird'], ['hamster', '🐹 Hamster'], ['other', '🐾 Other']];
const WEEKDAYS = [1, 2, 3, 4, 5]; const EVERY = [0, 1, 2, 3, 4, 5, 6];
// Starter chores. minAge is a gentle hint; families can tick anything.
const IDEAS = [
  { title: 'Make your bed', emoji: '🛏️', when: 'morning', minAge: 4 }, { title: 'Brush teeth', emoji: '🪥', when: 'morning', minAge: 3 },
  { title: 'Get dressed', emoji: '👕', when: 'morning', minAge: 3 }, { title: 'Pack your backpack', emoji: '🎒', when: 'morning', minAge: 6 },
  { title: 'Pack your lunch', emoji: '🥪', when: 'morning', minAge: 9 }, { title: 'Eat breakfast', emoji: '🥣', when: 'morning', minAge: 3 },
  { title: 'Unpack backpack', emoji: '🎒', when: 'after', minAge: 5 }, { title: 'Homework or reading', emoji: '📚', when: 'after', minAge: 6, timerMin: 20 },
  { title: 'Practice your instrument', emoji: '🎵', when: 'after', minAge: 6, timerMin: 15 }, { title: 'Set the table', emoji: '🍴', when: 'after', minAge: 5, who: 'either', rotate: true, days: EVERY },
  { title: 'Clear the table', emoji: '🍽️', when: 'after', minAge: 5, who: 'either', rotate: true, days: EVERY }, { title: 'Empty the dishwasher', emoji: '🍽️', when: 'after', minAge: 8, who: 'either', rotate: true, stars: 2 },
  { title: 'Put away your laundry', emoji: '👚', when: 'after', minAge: 7, days: [0, 6] }, { title: 'Tidy your room', emoji: '🧺', when: 'after', minAge: 4, days: [6], stars: 3 },
  { title: 'Take out the recycling', emoji: '♻️', when: 'after', minAge: 9, who: 'either', rotate: true, days: [3], stars: 2 },
];
const slug = (s, taken) => { let b = String(s || 'kid').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '').slice(0, 16) || 'kid'; let id = b, n = 2; while (taken.includes(id)) id = b + n++; return id; };
// A brand-new board starts with empty names (with examples as hints) rather than made-up people to erase.
function blankStart(x) {
  const n = structuredClone(x); if (n.family.name === 'Our Family') n.family.name = '';
  try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; if (tz && n.weather.lat == null) n.zone = tz; } catch {} // until they pick a town, use this device's time zone
  n.family.parents = n.family.parents.map((p) => (['Mom', 'Dad'].includes(p.name) ? { ...p, name: '', match: [] } : p));
  if (n.kids.map((k) => k.name).join() === 'Alex,Sam') n.kids = [{ ...n.kids[0], name: '' }];
  return n;
}
const STEPS = ['Welcome', 'Grown-ups', 'Kids', 'Pet', 'Home', 'Calendar', 'Chores', 'Looks', 'Finish'];

export function Setup({ b, pin, onDone }) {
  const rerun = !!b.auth?.enabled; // a family that already has sign-in is running setup again
  const [c, setC] = useState(null); const [step, setStep] = useState(0); const [busy, setBusy] = useState(false);
  useEffect(() => { api('/api/admin/config', undefined, pin).then((x) => setC(rerun ? x : blankStart(x))).catch((e) => toast(e.message)); }, []);
  if (!c) return html`<div class="wiz"><div class="wizcard"><h2>Getting setup ready…</h2></div></div>`;
  const edit = (fn) => setC((x) => { const n = structuredClone(x); fn(n); return n; });
  const save = async (n = c) => { setBusy(true); try { await put('/api/admin/config', { config: n }, pin); return true; } catch (e) { toast(e.message || 'Could not save'); return false; } finally { setBusy(false); } };
  const next = async () => { const problem = check[step]?.(c); if (problem) { toast(problem); chime('bad'); return; } if (await save()) { setStep(step + 1); document.querySelector('.wizcard')?.scrollTo(0, 0); } };
  const back = () => setStep(Math.max(0, step - 1));
  const Body = [Welcome, Grownups, Kids, Pet, Home, Calendar, Chores, Looks, Finish][step];
  return html`<div class="wiz"><div class="wizcard">
    <div class="wizsteps">${STEPS.map((s, i) => html`<span class=${i === step ? 'on' : i < step ? 'done' : ''}>${i < step ? '✓' : i + 1}<b>${s}</b></span>`)}</div>
    <${Body} c=${c} edit=${edit} b=${b} pin=${pin} rerun=${rerun} save=${save} onDone=${onDone} setBusy=${setBusy} back=${back} />
    ${step < STEPS.length - 1 ? html`<div class="wiznav">${step ? html`<button class="pill lite" onClick=${back}>‹ Back</button>` : html`<span></span>`}${rerun && step === 0 ? html`<button class="pill ghost" onClick=${async () => { edit((n) => { n.setup = { done: true }; }); if (await save({ ...c, setup: { done: true } })) onDone(); }}>Cancel</button>` : ''}<button class="pill" disabled=${busy} onClick=${next}>${busy ? 'Saving…' : 'Next ›'}</button></div>` : ''}
  </div></div>`;
}

const check = {
  0: (c) => (!c.family.name.trim() ? 'Give your board a name' : ''),
  1: (c) => (!c.family.parents.length ? 'Add at least one grown-up' : c.family.parents.some((p) => !p.name.trim()) ? 'Every grown-up needs a name' : ''),
  2: (c) => (!c.kids.length ? 'Add at least one kid' : c.kids.some((k) => !k.name.trim()) ? 'Every kid needs a name' : ''),
  4: (c) => (c.weather.lat == null && !c.weather.skipped ? 'Pick your town for the weather, or tap Skip' : ''),
};

function Welcome({ c, edit, rerun }) {
  return html`<h2>${rerun ? 'Run setup again' : 'Welcome to your family board! 👋'}</h2>
    <p class="wizp">${rerun ? 'Walk through the basics again. Everything you change saves as you go, and your chores, stars and history stay put.' : "Let's make it yours. It takes about ten minutes, and you can change anything later in Parents."}</p>
    <div class="wizf"><label>What should the board be called?</label><input class="gbox" autofocus value=${c.family.name} placeholder="The Rivera Family" onInput=${(e) => edit((n) => { n.family.name = e.target.value; })} /></div>`;
}

function Grownups({ c, edit }) {
  const ps = c.family.parents;
  return html`<h2>The grown-ups</h2><p class="wizp">Use the names the kids call you. The board says things like "Ask Mom or Dad".</p>
    ${ps.map((p, i) => html`<div class="wizrow"><input type="color" value=${p.color} onInput=${(e) => edit((n) => { n.family.parents[i].color = e.target.value; })} />
      <div class="wizcol"><input class="gbox" value=${p.name} placeholder=${i === 0 ? 'What the kids call you, like Mom' : 'Like Dad, Papa or Grandma'} onInput=${(e) => edit((n) => { const q = n.family.parents[i]; const old = q.name; q.name = e.target.value; q.match = [...new Set([q.name, ...(q.match || []).filter((w) => w !== old)].filter(Boolean))]; })} />
      <input class="gbox sm" value=${(p.match || []).filter((w) => w !== p.name).join(', ')} placeholder="Also matches calendar events with… (your first name, yoga)" onInput=${(e) => edit((n) => { const q = n.family.parents[i]; q.match = [...new Set([q.name, ...e.target.value.split(',').map((x) => x.trim()).filter(Boolean)])]; })} /></div>
      ${ps.length > 1 ? html`<button class="pill ghost sm" onClick=${() => edit((n) => { n.family.parents.splice(i, 1); })}>Remove</button>` : ''}</div>`)}
    ${ps.length < 4 ? html`<button class="pill lite" onClick=${() => edit((n) => { const id = slug('parent' + (n.family.parents.length + 1), n.family.parents.map((x) => x.id)); n.family.parents.push({ id, name: '', match: [], color: COLORS[(n.family.parents.length + 4) % COLORS.length] }); })}>+ Add a grown-up</button>` : ''}`;
}

function Kids({ c, edit }) {
  return html`<h2>The kids</h2><p class="wizp">Ages help suggest chores. The out-the-door time is when they leave for school, so the board can count down.</p>
    ${c.kids.map((k, i) => html`<div class="wizrow"><input type="color" value=${k.color} onInput=${(e) => edit((n) => { n.kids[i].color = e.target.value; })} />
      <div class="wizcol"><input class="gbox" value=${k.name} placeholder=${i === 0 ? 'First kid’s name' : 'Name'} onInput=${(e) => edit((n) => { n.kids[i].name = e.target.value; })} />
        <div class="wizinline"><label>Age <input type="number" min="2" max="18" value=${k.age || ''} onInput=${(e) => edit((n) => { n.kids[i].age = +e.target.value || null; })} /></label>
        <label>Out the door <input type="time" value=${k.leaveTime} onInput=${(e) => edit((n) => { n.kids[i].leaveTime = e.target.value; })} /></label>
        <label>Allowance $<input type="number" min="0" step="0.5" value=${k.weeklyAllowance} onInput=${(e) => edit((n) => { n.kids[i].weeklyAllowance = +e.target.value || 0; })} />/wk</label></div></div>
      ${c.kids.length > 1 ? html`<button class="pill ghost sm" onClick=${() => edit((n) => { n.kids.splice(i, 1); })}>Remove</button>` : ''}</div>`)}
    ${c.kids.length < 6 ? html`<button class="pill lite" onClick=${() => edit((n) => { const id = slug('kid' + (n.kids.length + 1), n.kids.map((x) => x.id)); n.kids.push({ id, name: '', color: COLORS[n.kids.length % COLORS.length], age: 8, leaveTime: n.kids[0]?.leaveTime || '07:45', weeklyAllowance: n.kids[0]?.weeklyAllowance ?? 5, morningStart: '06:30', avatar: { hair: HAIR[n.kids.length % HAIR.length][0], hairColor: '6a4e35', skinColor: 'f2d3b1', eyes: 'variant26', mouth: 'variant26' } }); })}>+ Add a kid</button>` : ''}`;
}

function Pet({ c, edit }) {
  const kind = c.family.petKind ?? (c.family.dog ? 'dog' : '');
  return html`<h2>Any pets?</h2><p class="wizp">A pet becomes the board's mascot. It says good morning and reminds the kids about pet chores.</p>
    <div class="chips big">${PETS.map(([k, l]) => html`<button class=${kind === k ? 'on' : ''} onClick=${() => edit((n) => { n.family.petKind = k; if (!k) n.family.dog = ''; })}>${l}</button>`)}</div>
    ${kind ? html`<div class="wizf"><label>What's their name?</label><input class="gbox" value=${c.family.dog} placeholder="Biscuit" onInput=${(e) => edit((n) => { n.family.dog = e.target.value; })} /></div>` : ''}`;
}

function Home({ c, edit }) {
  const [q, setQ] = useState(c.weather.place || ''); const [res, setRes] = useState(null);
  const search = async () => { if (!q.trim()) return; try { const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=${encodeURIComponent(q.trim())}`).then((x) => x.json()); setRes(r.results || []); } catch { toast('Could not search right now'); } };
  return html`<h2>Where's home?</h2><p class="wizp">For the weather and the clock. Just your town is enough.</p>
    <div class="wizinline"><input class="gbox" style="flex:1" value=${q} placeholder="Town or city" onInput=${(e) => setQ(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && search()} /><button class="pill" onClick=${search}>Search</button></div>
    ${res ? html`<div class="wizlist">${res.length ? res.map((r) => { const label = [r.name, r.admin1, r.country].filter(Boolean).join(', '); const on = c.weather.lat === r.latitude && c.weather.lon === r.longitude; return html`<button class=${on ? 'on' : ''} onClick=${() => edit((n) => { n.weather.lat = r.latitude; n.weather.lon = r.longitude; delete n.weather.skipped; n.weather.place = r.name; if (r.timezone) n.zone = r.timezone; })}>${on ? '✓ ' : ''}${label}</button>`; }) : html`<p class="wizp">No towns found. Try a nearby bigger town.</p>`}</div>` : ''}
    ${c.weather.lat != null ? html`<p class="wizok">✓ ${c.weather.place}, time zone ${c.zone}</p>` : ''}
    <div class="wizf"><label>Temperatures in</label><div class="chips big"><button class=${c.weather.units !== 'celsius' ? 'on' : ''} onClick=${() => edit((n) => { n.weather.units = 'fahrenheit'; })}>°F</button><button class=${c.weather.units === 'celsius' ? 'on' : ''} onClick=${() => edit((n) => { n.weather.units = 'celsius'; })}>°C</button></div></div>
    ${c.weather.lat == null ? html`<button class="pill ghost sm" style="margin-top:12px" onClick=${() => edit((n) => { n.weather.skipped = true; })}>${c.weather.skipped ? '✓ Skipping weather for now' : 'Skip weather for now'}</button>` : ''}`;
}

function Calendar({ c, edit, pin }) {
  const fam = c.calendars.find((x) => x.id === 'family') || c.calendars[0]; const [url, setUrl] = useState(fam?.url || ''); const [msg, setMsg] = useState('');
  const set = (v) => { setUrl(v); setMsg(''); edit((n) => { const f = n.calendars.find((x) => x.id === 'family') || n.calendars[0]; f.url = v.trim().replace(/^webcal:/i, 'https:'); }); };
  const test = async () => { setMsg('Checking…'); try { const r = await api('/api/admin/test-calendar', { url: url.trim().replace(/^webcal:/i, 'https:') }, pin); setMsg(`✓ Found ${r.events} events`); chime('ok'); } catch (e) { setMsg('✗ ' + (e.message || 'Could not read that link')); } };
  return html`<h2>Your family calendar</h2><p class="wizp">Paste the private iCal link of the calendar you share. The board reads it every 15 minutes. You can skip this and add it later.</p>
    <input class="gbox" value=${url} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" onInput=${(e) => set(e.target.value)} />
    <div class="wizinline"><button class="pill" disabled=${!url.trim()} onClick=${test}>Test the link</button><span class="wizp" style="margin:0">${msg}</span></div>
    <details class="wizhelp"><summary>Where do I find this link?</summary>
      <p><b>Google Calendar</b>: on a computer, open Settings, click the calendar on the left, scroll to "Integrate calendar" and copy "Secret address in iCal format".</p>
      <p><b>iCloud</b>: in the Calendar app, share the calendar, turn on "Public Calendar" and copy the link.</p>
      <p><b>Outlook</b>: Settings, Calendar, Shared calendars, "Publish a calendar", then copy the ICS link.</p>
      <p>Treat the link like a password. Anyone with it can read the calendar.</p></details>
    <p class="wizp">Events get each person's color when their name or keywords are in the title. More calendars can be added in Parents later.</p>`;
}

function Chores({ c, edit }) {
  const pet = c.family.dog; const ages = c.kids.map((k) => k.age || 8); const maxAge = Math.max(...ages);
  const ideas = [...IDEAS, ...(pet ? [{ title: `Feed ${pet}`, emoji: '🐾', when: 'morning', minAge: 5, who: 'either', rotate: true, days: EVERY }, { title: `Walk or play with ${pet}`, emoji: '🐾', when: 'after', minAge: 7, who: 'either', rotate: true, days: EVERY, stars: 2 }] : [])];
  const has = (t) => c.tasks.some((x) => x.title.toLowerCase() === t.toLowerCase());
  const toggle = (idea) => edit((n) => { const i = n.tasks.findIndex((x) => x.title.toLowerCase() === idea.title.toLowerCase()); if (i >= 0) n.tasks.splice(i, 1); else n.tasks.push({ id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), title: idea.title, emoji: idea.emoji, who: c.kids.length > 1 ? idea.who || 'both' : c.kids[0].id, rotate: !!idea.rotate, when: idea.when, days: idea.days || (idea.when === 'morning' ? WEEKDAYS : WEEKDAYS), stars: idea.stars || 1, ...(idea.timerMin ? { timerMin: idea.timerMin } : {}) }); });
  const custom = c.tasks.filter((t) => !ideas.some((x) => x.title.toLowerCase() === t.title.toLowerCase()));
  const list = (when) => html`${ideas.filter((x) => x.when === when).map((x) => html`<button class=${'wizchk' + (has(x.title) ? ' on' : '') + (x.minAge > maxAge ? ' old' : '')} onClick=${() => toggle(x)}><span>${has(x.title) ? '✅' : '⬜'}</span>${x.emoji} ${x.title}${x.who === 'either' ? html`<small>take turns</small>` : ''}${x.minAge > maxAge ? html`<small>ages ${x.minAge}+</small>` : ''}</button>`)}`;
  return html`<h2>Routines and chores</h2><p class="wizp">Tick a starter set. Each one earns stars toward the weekly allowance. "Take turns" chores rotate between the kids. You can fine-tune days, stars and who in Parents later.</p>
    <div class="wizgrp"><h4>☀️ Before school</h4>${list('morning')}</div><div class="wizgrp"><h4>🏡 After school</h4>${list('after')}</div>
    ${custom.length ? html`<div class="wizgrp"><h4>Already on your board</h4>${custom.map((t) => html`<button class="wizchk on" onClick=${() => edit((n) => { n.tasks = n.tasks.filter((x) => x.id !== t.id); })}><span>✅</span>${t.emoji} ${t.title}</button>`)}</div>` : ''}
    <div class="wizf"><label>Pay day, when the allowance week ends</label><div class="chips big">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => html`<button class=${(Number.isInteger(c.week.payDay) ? c.week.payDay : 0) === i ? 'on' : ''} onClick=${() => edit((n) => { n.week.payDay = i; })}>${d}</button>`)}</div></div>
    <div class="wizf"><label>Weekly prize for a great week</label><div class="wizinline"><input class="gbox sm" style="flex:0 0 64px;text-align:center" value=${c.prize.emoji} onInput=${(e) => edit((n) => { n.prize.emoji = e.target.value; })} /><input class="gbox sm" style="flex:1" value=${c.prize.title} onInput=${(e) => edit((n) => { n.prize.title = e.target.value; })} /></div></div>`;
}

function Looks({ c, edit }) {
  const [i, setI] = useState(0); const k = c.kids[Math.min(i, c.kids.length - 1)]; const ki = c.kids.indexOf(k);
  const setLook = (key, v) => edit((n) => { n.kids[ki].avatar = { ...(n.kids[ki].avatar || {}), [key]: v }; });
  const a = k.avatar || {};
  return html`<h2>Make your avatar</h2><p class="wizp">Hand the tablet to each kid. They can unlock more outfits later with stars.</p>
    ${c.kids.length > 1 ? html`<div class="chips big">${c.kids.map((x, j) => html`<button class=${j === ki ? 'on' : ''} onClick=${() => setI(j)}>${x.name}</button>`)}</div>` : ''}
    <div class="wizlook"><${Avatar} kid=${k} size="150px" /><div class="wizcol">
      <label>Hair</label><div class="chips">${HAIR.map(([v, l]) => html`<button class=${a.hair === v ? 'on' : ''} onClick=${() => setLook('hair', v)}>${l}</button>`)}</div>
      <label>Hair color</label><div class="chips">${HAIR_COLORS.map(([v, l]) => html`<button class=${a.hairColor === v ? 'on' : ''} onClick=${() => setLook('hairColor', v)}><i class="sw" style=${{ background: '#' + v }}></i>${l}</button>`)}</div>
      <label>Skin</label><div class="chips">${SKIN.map((v) => html`<button class=${a.skinColor === v ? 'on' : ''} onClick=${() => setLook('skinColor', v)}><i class="sw" style=${{ background: '#' + v }}></i></button>`)}</div>
      <button class="pill ghost sm" style="align-self:flex-start;margin-top:8px" onClick=${() => { const r = (l) => l[Math.random() * l.length | 0]; setLook('eyes', 'variant' + String(1 + (Math.random() * 26 | 0)).padStart(2, '0')); setLook('mouth', 'variant' + String(1 + (Math.random() * 30 | 0)).padStart(2, '0')); }}>🎲 New face</button></div></div>`;
}

function Finish({ c, edit, b, pin, rerun, save, onDone, setBusy, back }) {
  const [newPin, setNewPin] = useState(rerun ? '' : ''); const [mode, setMode] = useState(b.auth?.google ? 'google' : 'password');
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [who, setWho] = useState(c.family.parents[0]?.id); const [display, setDisplay] = useState(null); const [code, setCode] = useState(''); const [working, setWorking] = useState(false);
  const pinOk = rerun ? !newPin || /^\d{4,8}$/.test(newPin) : /^\d{4,8}$/.test(newPin);
  const finish = async () => {
    if (!pinOk) { toast('Choose a PIN of 4 to 8 digits'); return; } if (!rerun && display === null) { toast('Pick which device this is'); return; }
    setWorking(true); setBusy(true);
    const n = structuredClone(c); if (newPin) n.pin = newPin; n.setup = { done: true }; if (!n.week.startedOn) n.week.startedOn = b.today; const usePin = newPin || pin;
    try {
      await put('/api/admin/config', { config: n }, pin || usePin);
      await api('/api/admin/refresh', {}, usePin).catch(() => {});
      if (rerun) { confetti(); chime('win'); onDone(); return; }
      if (mode === 'google') { const r = await api('/api/admin/setup-google', { personId: who, display }, usePin); location.href = r.url; return; }
      const r = await api('/api/admin/setup', { email, password: pw, personId: who, display }, usePin); setCode(r.recoveryCode); confetti(); chime('win');
    } catch (e) { toast(e.message || 'Something went wrong'); } finally { setWorking(false); setBusy(false); }
  };
  if (code) return html`<h2>You're all set! 🎉</h2><p class="wizp">Save this recovery code somewhere safe, like your password manager. It's the way back in if you ever forget your password.</p><div class="wizcode">${code}</div><button class="pill" onClick=${() => location.reload()}>Open the board</button>`;
  return html`<h2>${rerun ? 'All done?' : 'Last step: keep it yours'}</h2>
    <div class="wizf"><label>${rerun ? 'New grown-up PIN (leave blank to keep it)' : 'Grown-up PIN, for Parents on the shared screen'}</label><input class="gbox" style="max-width:200px;letter-spacing:.3em;text-align:center" inputmode="numeric" maxlength="8" value=${newPin} placeholder="••••" onInput=${(e) => setNewPin(e.target.value.replace(/\D/g, ''))} /></div>
    ${rerun ? '' : html`<div class="wizf"><label>Your sign-in. Only signed-in devices can open the board.</label>
      <div class="chips big">${c.family.parents.map((p) => html`<button class=${who === p.id ? 'on' : ''} onClick=${() => setWho(p.id)}>I'm ${p.name}</button>`)}</div>
      ${b.auth?.google ? html`<div class="chips big"><button class=${mode === 'google' ? 'on' : ''} onClick=${() => setMode('google')}>Continue with Google</button><button class=${mode === 'password' ? 'on' : ''} onClick=${() => setMode('password')}>Email and password</button></div>` : ''}
      ${mode === 'password' ? html`<input class="gbox" type="email" autocomplete="username" placeholder="Email" value=${email} onInput=${(e) => setEmail(e.target.value)} /><input class="gbox" type="password" autocomplete="new-password" placeholder="Password, at least 10 characters" value=${pw} onInput=${(e) => setPw(e.target.value)} />` : ''}
      <label>Which device are you holding right now?</label><div class="chips big"><button class=${display === true ? 'on' : ''} onClick=${() => setDisplay(true)}>🖥️ The shared family screen</button><button class=${display === false ? 'on' : ''} onClick=${() => setDisplay(false)}>📱 My own phone</button></div>
      <p class="wizp">${display === true ? 'This screen stays signed in for the whole family. Grown-up areas ask for the PIN.' : display === false ? 'Your phone gets the grown-ups’ view. Sign in on the family screen later with the same account.' : ''}</p>
      <p class="wizp">Invite the other grown-ups from Parents → Sign-in and devices once you're in.</p></div>`}
    <div class="wiznav"><button class="pill lite" onClick=${back}>‹ Back</button><button class="pill sun big" disabled=${working} onClick=${finish}>${working ? 'Finishing…' : rerun ? 'Save and finish ✨' : mode === 'google' ? 'Finish with Google ✨' : 'Finish setup ✨'}</button></div>`;
}
