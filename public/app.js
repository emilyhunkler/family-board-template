import { h, render } from 'https://cdn.jsdelivr.net/npm/preact@11.2.0/+esm';
import { useState, useEffect, useRef, useMemo, useCallback } from 'https://cdn.jsdelivr.net/npm/preact@11.2.0/hooks/+esm';
import htm from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/+esm';
import { Parents } from './parents.js';
import { useVoice, speak, dictate, primeSpeech } from './voice.js';
import { TRIVIA, JOKES, FACTS, WOULD_YOU_RATHER, GEAR } from './fun.js';
import { BrainCard } from './brain.js';
import { AppSheet, AppNudge, nudgeWanted, reopenGuide, inApp } from './install.js';
export const html = htm.bind(h);

// ---------- helpers ----------
export const api = async (path, body, pin) => { const r = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(pin ? { 'x-pin': pin } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); if (r.status === 401 && !path.includes('/admin/')) { location.reload(); } const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), j); return j; };
export const put = (path, body, pin) => fetch(path, { method: 'PUT', headers: { 'content-type': 'application/json', ...(pin ? { 'x-pin': pin } : {}) }, body: JSON.stringify(body) }).then(async (r) => { const j = await r.json(); if (!r.ok) throw Object.assign(new Error(j.error), j); return j; });
export const del = (path, pin) => fetch(path, { method: 'DELETE', headers: pin ? { 'x-pin': pin } : {} }).then((r) => r.json());
const pad = (n) => String(n).padStart(2, '0');
export const fmtClock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const DAYN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']; const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const ymdLocal = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = fromYmd(s); d.setDate(d.getDate() + n); return ymdLocal(d); };
const longDate = (s) => { const d = fromYmd(s); return `${DAYN[d.getDay()]}, ${MONL[d.getMonth()]} ${d.getDate()}`; };
const minsUntil = (hhmm, now) => { const [h, m] = String(hhmm || 'x').split(':').map(Number); return h * 60 + m - (now.getHours() * 60 + now.getMinutes()); };
// "Mom or Dad", from whatever the kids call their grown-ups.
// "A, B and C"
export const andList = (xs) => xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
export const grownups = (b) => (b.config.family.parents || []).map((p) => p.name).join(' or ') || 'a grown-up';
// "today", "tomorrow" or the weekday name of this week's pay day
export const payLabel = (b) => { if (!b.payDay) return ''; if (b.payDay === b.today) return 'today'; if (b.payDay === addDays(b.today, 1)) return 'tomorrow'; return DAYN[fromYmd(b.payDay).getDay()]; };
const money = (n) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;
export const toast = (msg) => { const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; document.body.appendChild(el); setTimeout(() => el.remove(), 2200); };
let audio; export function chime(kind = 'ok') { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); const o = audio.createOscillator(), g = audio.createGain(); o.connect(g); g.connect(audio.destination); const t = audio.currentTime; const notes = kind === 'ok' ? [660, 880] : kind === 'win' ? [523, 659, 784, 1046] : [330]; notes.forEach((f, i) => { o.frequency.setValueAtTime(f, t + i * 0.12); }); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12 * notes.length + 0.2); o.start(t); o.stop(t + 0.12 * notes.length + 0.25); } catch {} }
// Pay day's "cha-ching": the drawer's rattle, then two bright bell notes.
export function cashSound() { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); const t = audio.currentTime; const out = audio.destination;
  const len = Math.floor(audio.sampleRate * 0.09); const buf = audio.createBuffer(1, len, audio.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const n = audio.createBufferSource(); n.buffer = buf; const hp = audio.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500; const ng = audio.createGain(); ng.gain.value = 0.22; n.connect(hp); hp.connect(ng); ng.connect(out); n.start(t);
  [[1568, 0.1], [2093, 0.22], [2637, 0.22]].forEach(([f, at]) => { const o = audio.createOscillator(), g = audio.createGain(); o.type = 'triangle'; o.frequency.value = f; o.connect(g); g.connect(out); g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(0.18, t + at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.7); o.start(t + at); o.stop(t + at + 0.75); });
} catch {} }
export function confetti() { const c = document.createElement('canvas'); c.className = 'conf'; c.width = innerWidth; c.height = innerHeight; document.body.appendChild(c); const x = c.getContext('2d'); const P = Array.from({ length: 140 }, () => ({ x: innerWidth / 2, y: innerHeight / 2, vx: (Math.random() - .5) * 18, vy: -Math.random() * 16 - 4, c: ['#ff7a90', '#ffc857', '#5aa9ff', '#7fd6b0', '#c3a6ff'][Math.random() * 5 | 0], r: Math.random() * 7 + 3, a: Math.random() * 6 })); let f = 0; const step = () => { x.clearRect(0, 0, c.width, c.height); for (const p of P) { p.x += p.vx; p.y += p.vy; p.vy += .45; p.a += .1; x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.c; x.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * .6); x.restore(); } if (++f < 90) requestAnimationFrame(step); else c.remove(); }; step(); }

// ---------- avatars (DiceBear adventurer, runs in the browser) ----------
let dice = null; const diceLoad = Promise.all([import('https://cdn.jsdelivr.net/npm/@dicebear/core@9.4.3/+esm'), import('https://cdn.jsdelivr.net/npm/@dicebear/adventurer@9.4.2/+esm')]).then(([core, adv]) => { dice = { core, adv }; }).catch((e) => console.warn('avatar lib', e));
const avCache = new Map();
// Backgrounds that are a gradient rather than one color.
export const BG_FILL = { rainbow: 'conic-gradient(#ffb3bd,#ffe39a,#b9f3d2,#b3dbff,#e0c9ff,#ffb3bd)', sunset: 'linear-gradient(160deg,#ffe29f,#ffa99f 55%,#ff719a)',
  ocean: 'linear-gradient(160deg,#c2e9fb,#a1c4fd 60%,#7aa7f0)', forest: 'linear-gradient(160deg,#d4f5c4,#8fd3a0 60%,#4f9d6b)',
  candy: 'linear-gradient(160deg,#fbc2eb,#d9c6ff 55%,#a6c1ee)', galaxy: 'radial-gradient(circle at 30% 25%,#8e7cff,#3a2f7a 55%,#141b33)' };
export const bgFill = (v) => BG_FILL[v] || '#' + v;
export function avatarSvg(look) {
  if (!dice) return '';
  const key = JSON.stringify(look); if (avCache.has(key)) return avCache.get(key);
  const o = { seed: 'kid', hair: [look.hair || 'long16'], hairColor: [look.hairColor || '97804f'], skinColor: [look.skinColor || 'f2d3b1'], eyes: [look.eyes || 'variant26'], mouth: [look.mouth || 'variant26'], featuresProbability: look.features ? 100 : 0, backgroundColor: [look.bg && !BG_FILL[look.bg] ? look.bg : 'transparent'], glassesProbability: look.glasses ? 100 : 0, earringsProbability: look.earrings ? 100 : 0 };
  if (look.features) o.features = [look.features]; if (look.eyebrows) o.eyebrows = [look.eyebrows]; if (look.glasses) o.glasses = [look.glasses]; if (look.earrings) o.earrings = [look.earrings];
  let svg = ''; try { svg = dice.core.createAvatar(dice.adv, o).toString(); } catch (e) { console.warn(e); }
  avCache.set(key, svg); return svg;
}
export function Avatar({ kid, look, size }) {
  const [, tick] = useState(0); useEffect(() => { diceLoad.then(() => tick((n) => n + 1)); }, []);
  const lk = { ...(kid?.avatar || {}), ...(look || kid?.wardrobe?.look || {}) }; const svg = avatarSvg(lk);
  // Pets, extras and gear sit on top like stickers, sized to the avatar (cqw), so they show at every size.
  const badge = (v, pos) => v ? html`<span class="avb" style=${pos}>${v}</span>` : '';
  return html`<div class="av" style=${{ width: size, height: size, position: 'relative', flex: 'none', containerType: 'inline-size' }}>
    <div style=${{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', background: lk.bg ? bgFill(lk.bg) : '#e3f2e7' }} dangerouslySetInnerHTML=${{ __html: svg }}></div>
    ${badge(lk.pet, 'right:-2%;bottom:-2%')}${badge(lk.extra, 'left:-2%;top:-2%')}${badge(lk.gear, 'left:-2%;bottom:-2%')}
  </div>`;
}
// The mascot is the family's pet when they have one (the dog drawing for dogs, an emoji otherwise), or a smiling sun.
const PET_EMOJI = { cat: '🐱', bunny: '🐰', fish: '🐠', bird: '🐦', hamster: '🐹', guinea: '🐹', turtle: '🐢', lizard: '🦎', horse: '🐴', owl: '🦉', fox: '🦊', dragon: '🐉', robot: '🤖', unicorn: '🦄', penguin: '🐧', sun: '🌞' };
// Characters are sidekicks, not pets: no pet food on the grocery list.
const CHARACTER = new Set(['owl', 'fox', 'dragon', 'robot', 'unicorn', 'penguin', 'sun']);
export let MASCOT = '<img src="/dog.svg" alt="dog">';
export function setMascot(fam) { const k = fam?.petKind || (fam?.dog ? 'dog' : ''); MASCOT = k === 'dog' ? `<img src="/dog.svg" alt="${fam.dog || 'dog'}">` : `<span class="mascot-emoji" role="img" aria-label="${fam?.dog || 'sun'}">${PET_EMOJI[k] || (k ? '🐾' : '🌞')}</span>`; }

// ---------- small components ----------
export function Ring({ pct, color, label, size = 74, text }) {
  const r = (size - 10) / 2, c = 2 * Math.PI * r;
  return html`<div class="rg"><svg width=${size} height=${size} viewBox="0 0 ${size} ${size}"><circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" style="stroke:var(--soft2)" stroke-width="9"/><circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke=${color} stroke-width="9" stroke-linecap="round" stroke-dasharray=${c} stroke-dashoffset=${c * (1 - Math.max(0, Math.min(1, pct)))} transform="rotate(-90 ${size / 2} ${size / 2})" style="transition:stroke-dashoffset .5s"/><text x="50%" y="54%" text-anchor="middle" font-family="Baloo 2" font-weight="800" font-size=${size * 0.24} style="fill:var(--ink)">${text}</text></svg>${label ? html`<small>${label}</small>` : ''}</div>`;
}
function PinPad({ onOk, onClose, title = 'Grown-up PIN' }) {
  const [v, setV] = useState('');
  const press = (d) => { const n = v + d; setV(n); if (n.length === 4) { onOk(n); } };
  return html`<div class="ov pinov" onClick=${onClose}><div class="sheet" style="width:360px;text-align:center" onClick=${(e) => e.stopPropagation()}><button class="close" onClick=${onClose}>×</button><h3 style="justify-content:center">${title}</h3><div class="pindots">${[0, 1, 2, 3].map((i) => html`<i class=${v.length > i ? 'on' : ''}></i>`)}</div>
    <div class="pinpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => html`<button onClick=${() => press(String(d))}>${d}</button>`)}<button onClick=${() => setV('')}>⌫</button><button onClick=${() => press('0')}>0</button><button onClick=${onClose}>✕</button></div></div></div>`;
}
export function usePin() {
  const [pin, setPin] = useState(sessionStorage.getItem('pin') || ''); const [ask, setAsk] = useState(null); const parentRef = useRef(false);
  const withPin = useCallback((fn) => { if (parentRef.current) return fn(pin || ''); if (pin) return fn(pin); return new Promise((res) => setAsk({ fn, res })); }, [pin]);
  const ui = ask ? html`<${PinPad} onClose=${() => { ask.res(null); setAsk(null); }} onOk=${async (p) => { try { await api('/api/admin/config', undefined, p); } catch (e) { chime('bad'); if (e.locked) { toast(e.message); ask.res(null); setAsk(null); } else toast('Wrong PIN'); return; } setPin(p); sessionStorage.setItem('pin', p); const r = await ask.fn(p); ask.res(r); setAsk(null); }} />` : null;
  return { pin, setPin: (p) => { setPin(p); if (p) sessionStorage.setItem('pin', p); else sessionStorage.removeItem('pin'); }, withPin, ui, setParent: (v) => { parentRef.current = !!v; } };
}

// ---------- weather pieces ----------
function WxPill({ b, onClick }) { const w = b.weather; if (!w) return html`<div class="wx2" onClick=${onClick}><div class="big">--</div></div>`; const d = w.days.find((x) => x.date === b.today) || w.days[0]; return html`<div class="wx2" onClick=${onClick}><span class="ico">${w.current.icon}</span><div class="big">${w.current.temp}°<small>feels ${w.current.feels}°</small></div><div class="cols"><div>High<b>${d.high}°</b></div><div>Low<b>${d.low}°</b></div><div>Rain<b>${d.rainPct}%</b></div></div>${b.tip ? html`<span class="tip">${b.tip}</span>` : ''}</div>`; }
function WxPanel({ b, onClose }) { const w = b.weather; if (!w) return null; const nowH = new Date().getHours(); const hrs = w.hourly.filter((x) => x.date === b.today && +x.hour.slice(0, 2) >= nowH).slice(0, 12); const d0 = w.days.find((x) => x.date === b.today) || w.days[0];
  return html`<div class="ov" onClick=${onClose}><div class="sheet" style="width:min(760px,100%)" onClick=${(e) => e.stopPropagation()}><button class="close" onClick=${onClose}>×</button><h3>${w.current.icon} ${w.place}: ${w.current.temp}°, ${w.current.label}<span class="seg" style="margin-left:auto;font-size:13px"><button class=${b.config.weather.units !== 'celsius' ? 'on' : ''} onClick=${() => b.setUnits('fahrenheit')}>°F</button><button class=${b.config.weather.units === 'celsius' ? 'on' : ''} onClick=${() => b.setUnits('celsius')}>°C</button></span></h3><div class="meta">Feels like ${w.current.feels}° · wind ${w.current.wind} mph · humidity ${w.current.humidity}% · sunrise ${d0.sunrise} · sunset ${d0.sunset} ${b.tip ? ' · ' + b.tip : ''}</div>
    <div class="hourly" style="margin-top:12px">${hrs.map((x) => html`<div>${x.hour}<span>${x.icon}</span><b>${x.temp}°</b>${x.rainPct ? html`<small style="display:block">${x.rainPct}%</small>` : ''}</div>`)}</div>
    <table class="t">${w.days.map((d) => html`<tr><td style="width:120px">${d.date === b.today ? 'Today' : DAYN[fromYmd(d.date).getDay()]}</td><td style="font-size:20px">${d.icon}</td><td>${d.label}</td><td><b>${d.high}°</b> / ${d.low}°</td><td>💧 ${d.rainPct}%</td><td>☀️ ${d.sunrise} · 🌙 ${d.sunset}</td></tr>`)}</table></div></div>`; }

// ---------- event sheet ----------
function EventSheet({ ev, b, onClose }) {
  const place = ev.place; const q = encodeURIComponent(ev.location || ev.title); const embed = place?.lat ? `https://www.openstreetmap.org/export/embed.html?bbox=${place.lon - .02},${place.lat - .012},${place.lon + .02},${place.lat + .012}&layer=mapnik&marker=${place.lat},${place.lon}` : null;
  return html`<div class="ov" onClick=${onClose}><div class="sheet" onClick=${(e) => e.stopPropagation()}><button class="close" onClick=${onClose}>×</button><h3>${ev.emoji} ${ev.title}</h3>
    <div class="meta">${ev.date === b.today ? 'Today' : longDate(ev.date)} · ${ev.allDay ? 'all day' : ev.timeLabel + ' to ' + ev.endLabel} · ${ev.who}</div>
    ${ev.location ? html`<div class="meta" style="color:var(--muted)">📍 ${ev.location}</div>` : ''}
    ${embed ? html`<div class="map"><iframe src=${embed} loading="lazy"></iframe></div>` : ''}
    ${place ? html`<div class="facts"><div class="fact">Drive<b>${place.driveMin} min</b></div><div class="fact leave">Leave by<b>${place.leaveBy}</b></div><div class="fact">Buffer<b>${place.bufferMin} min</b></div></div>` : ''}
    ${ev.description ? html`<p style="font-weight:700;color:var(--ink2);white-space:pre-wrap">${ev.description.slice(0, 400)}</p>` : ''}
    <div class="btns">${ev.location ? html`<a class="pill" target="_blank" href=${'https://www.google.com/maps/dir/?api=1&destination=' + q}>📍 Directions</a>` : ''}<button class="pill lite" onClick=${() => { primeSpeech(); speak(`${ev.title}, ${ev.date === b.today ? 'today' : longDate(ev.date)} at ${ev.timeLabel}${place ? ', leave by ' + place.leaveBy : ''}`, { direct: true }); }}>🔈 Say it</button></div></div></div>`;
}

// ---------- pages ----------
// Notes a grown-up posted: a big sticky card on the kitchen screens, with a Got it button that clears it for everyone.
let refreshBoard = () => {};
const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 2 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
function NoteCards({ b, max = 3 }) {
  const [gone, setGone] = useState([]); const list = b.notes.filter((n) => !gone.includes(n.id)).slice(0, max);
  if (!list.length) return '';
  const ok = async (e, n) => { e.stopPropagation(); setGone((g) => [...g, n.id]); chime('ok'); try { await del('/api/note/' + n.id); } catch {} refreshBoard(); };
  return html`<div class="notewall">${list.map((n) => html`<div class="stick" key=${n.id} onClick=${(e) => e.stopPropagation()}><span class="pinx">📌</span><div class="nt">${n.text}<small>${n.from_who ? 'from ' + n.from_who + ' · ' : ''}${ago(n.created_at)}</small></div><button class="gotit" onClick=${(e) => ok(e, n)}>✓ Got it</button></div>`)}</div>`;
}
function Home({ b, go, openEv, setPage }) {
  const now = new Date(); const todays = b.events.filter((e) => e.date === b.today); const prize = b.config.prize;
  return html`<div class="page home-page">
    ${b.sampleData ? html`<div class="banner" style="margin:0 0 10px">Showing sample events. Add your Google calendar links in Parents → Calendar and weather.</div>` : ''}
    <${NoteCards} b=${b} />
    <div class="home">${b.kids.map((k) => html`<div class="card kc" onClick=${() => setPage(k.id)}>
      <${Avatar} kid=${k} size="150px" />
      <div><div class="name">${k.name}<small>Level ${k.level.level} ${k.level.name} ${k.streak ? ` · 🔥 ${k.streak} day streak` : ''}${b.isSchoolDay ? leaveText(k, now) : ''}</small></div>
        <div class="rings"><${Ring} pct=${k.today.length ? k.today.filter((t) => t.done && !t.doneByOther).length / k.today.filter((t) => !t.doneByOther).length : 0} color=${k.color} label="Today" text=${`${k.today.filter((t) => t.done && !t.doneByOther).length}/${k.today.filter((t) => !t.doneByOther).length}`} />
          <${Ring} pct=${k.week.possible ? k.week.earned / k.week.possible : 0} color="#ffc857" label="Week" text=${Math.round(k.week.possible ? 100 * k.week.earned / k.week.possible : 0) + '%'} />
          <${Ring} pct=${k.week.prize.progress} color="#c3a6ff" label="Prize" text=${prize.emoji} /></div>
        <div class="money"><b>${money(k.week.total)}</b><span>of ${money(k.week.max)} · ${payLabel(b) === 'today' ? 'pay day today! 💰' : 'pay day ' + payLabel(b)} · ★ ${k.week.bonusStars} bonus</span></div>
        ${k.payday ? html`<span class="paybadge">💰 Pay day! Tap to collect ${money(k.payday.total)}</span>` : k.bank?.on && k.bank.balance > 0 ? html`<div class="bankmini">🏦 ${money(k.bank.balance)} in the bank</div>` : ''}</div></div>`)}</div>
    <div class="card prize"><div class="ic">${prize.emoji}</div><div class="t">This week's prize: ${prize.title}<small>Every task all week (${prize.missesAllowed} miss${prize.missesAllowed === 1 ? '' : 'es'} allowed) and ${prize.bonusStars} bonus stars.</small></div>
      <div class="pb">${b.kids.map((k) => html`<div>${k.name} · ${k.week.prize.onTrack ? `${k.week.misses} miss${k.week.misses === 1 ? '' : 'es'}` : 'missed too many'} · ★ ${k.week.bonusStars}/${prize.bonusStars}<div class="bar"><i style=${{ width: Math.round(100 * k.week.prize.progress) + '%', background: k.color }}></i></div></div>`)}</div></div>
    <div class="now">${todays.length ? todays.map((e) => { const s = new Date(e.start), en = new Date(e.end); const live = !e.allDay && s <= now && now < en; const past = en < now; return html`<div class=${'card ev' + (live ? ' live' : past ? ' past' : '')} onClick=${() => openEv(e)}><span class="tm">${live ? 'Now' : e.timeLabel}</span><span class="pip" style=${{ background: e.color }}></span><span class="tt">${e.emoji} ${e.title}<small>${e.who}${e.place ? ' · leave ' + e.place.leaveBy : ''}${e.location ? ' · ' + e.location.split(',')[0] : ''}</small></span></div>`; }) : html`<div class="card ev"><span class="tt">Nothing on the calendar today 🎈</span></div>`}</div>
    <div class="mascot-row"><div class="mascot" dangerouslySetInnerHTML=${{ __html: MASCOT }}></div><${MascotBubble} b=${b} now=${now} /></div>
  </div>`;
}
function leaveText(k, now) { const m = minsUntil(k.leaveTime, now); if (m > 0 && m <= 180) return ` · out the door in ${m} min`; if (m <= 0 && m > -600) return ' · have a great day'; return ''; }
const woof = (b) => ({ dog: 'Woof! ', cat: 'Meow! ' })[b.config.family.petKind || (b.config.family.dog ? 'dog' : '')] || '';
// What the mascot says. Time-sensitive reminders always win (leave soon, out the door, bedtime, pay day).
// Otherwise it takes turns: a nudge or a cheer, then something fun (trivia, a joke, a fact, would-you-rather),
// changing every 2 minutes. Every screen shows the same line, and the day starts at a different spot in the list.
const SLOT_MIN = 2;
const daySeed = (ymd) => [...ymd].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const funPool = (() => { let cache; return () => { if (cache) return cache; const t = TRIVIA.map(([q, a]) => ({ text: q, answer: a, kind: 'trivia' })), j = JOKES.map(([q, a]) => ({ text: q, answer: a, kind: 'joke' })), f = FACTS.map((x) => ({ text: 'Did you know? ' + x, kind: 'fact' })), w = WOULD_YOU_RATHER.map((x) => ({ text: x, kind: 'wyr' }));
  cache = []; for (let i = 0; i < Math.max(t.length, j.length, f.length, w.length); i++) for (const l of [t, j, f, w]) if (l[i]) cache.push(l[i]); return cache; }; })();
const gearFor = (title) => GEAR.find(([re]) => re.test(title))?.[1];
const leftList = (ts) => ts.slice(0, 2).map((t) => t.title.toLowerCase()).join(' and ') + (ts.length > 2 ? ` and ${ts.length - 2} more` : '');
export function mascotSay(b, now, skip = 0) {
  const pet = b.config.family.dog; const mins = now.getHours() * 60 + now.getMinutes(); const hm = (s) => { const [h, m] = String(s || '').split(':').map(Number); return h * 60 + (m || 0); };
  const mine = (k) => k.today.filter((t) => !t.doneByOther); const left = (k, when) => mine(k).filter((t) => !t.done && (when === 'morning' ? t.when === 'morning' : t.when !== 'morning'));
  // 1. Reminders that matter right now.
  for (const e of b.events.filter((x) => x.date === b.today && !x.allDay)) {
    const start = new Date(e.start); const until = Math.round((start - now) / 60000); const gear = gearFor(e.title); const who = e.who ? e.who + ', ' : '';
    if (e.place?.leaveBy) { const l = hm(e.place.leaveBy) - mins; if (l >= 0 && l <= 20) return { text: `${who}leave for ${e.title} ${l <= 1 ? 'now' : `in ${l} minutes`}! 🚗${gear ? ` Bring ${gear}.` : ''}`, urgent: true }; }
    else if (until > 0 && until <= 15) return { text: `${e.title} starts in ${until} minute${until === 1 ? '' : 's'}!${gear ? ` Bring ${gear}.` : ''} ⏰`, urgent: true };
  }
  if (b.isSchoolDay) for (const k of b.kids) { const m = minsUntil(k.leaveTime, now); const l = left(k, 'morning');
    if (m > 0 && m <= 15) return { text: `${k.name}, out the door in ${m} minute${m === 1 ? '' : 's'}! 🎒${l.length ? ` Still to do: ${leftList(l)}.` : ''}`, urgent: true };
    if (m > 15 && m <= 45 && l.length && Math.floor(mins / SLOT_MIN) % 2 === 0) return { text: `${k.name}, ${l.length} thing${l.length === 1 ? '' : 's'} before school: ${leftList(l)}. ⏳`, urgent: true }; }
  if (b.isSchoolDay && b.tip && b.tip !== 'Nice day' && mins < Math.max(...b.kids.map((k) => hm(k.leaveTime)), 0) && mins >= hm('06:00')) { const tipLine = { text: `Weather check: ${b.tip}! Dress for it. 🌦️`, urgent: true }; if (Math.floor(mins / SLOT_MIN) % 3 === 1) return tipLine; }
  const amb = b.config.ambient || {}; if (amb.dimAtNight !== false && amb.sleepFrom) { const bed = hm(amb.sleepFrom) - mins; if (bed > 0 && bed <= 30) return { text: `The board goes to sleep in ${bed} minutes. Time for teeth and pajamas! 🪥🌙`, urgent: true }; }
  if (b.payDay === b.today) { const close = hm(b.config.week?.closesAt || '18:00'); if (mins >= close && mins < close + 120) { const paid = b.kids.filter((k) => k.week.total > 0); return { text: paid.length ? `It's pay day! 💰 ${andList(paid.map((k) => `${k.name} earned ${money(k.week.total)}`))}!` : "It's pay day! 💰 Let's count up this week's stars.", urgent: true }; } if (mins >= close - 180 && mins < close && Math.floor(mins / SLOT_MIN) % 2 === 0) return { text: `Pay day today at ${b.config.week?.closesAt}! Finish your jobs to earn the most. 💰`, urgent: true }; }
  // 2. Nudges and cheers, which take turns with the fun.
  const turns = [];
  const hungry = pet && b.kids.find((k) => mine(k).some((t) => !t.done && /feed|walk/i.test(t.title)));
  if (hungry) { const t = mine(hungry).find((x) => !x.done && /feed|walk/i.test(x.title)); turns.push({ text: `${woof(b)}${hungry.name}, ${/walk/i.test(t.title) ? 'walk time?' : "I'm hungry!"} 🐾` }); }
  if (mins >= hm('15:00')) for (const k of b.kids) { const l = left(k, 'after'); if (l.length) turns.push({ text: `${k.name}, ${l.length} job${l.length === 1 ? '' : 's'} left today: ${leftList(l)}. You've got this! 💪` }); }
  const done = b.kids.filter((k) => mine(k).length && mine(k).every((t) => t.done)); if (done.length) turns.push({ text: `${andList(done.map((k) => k.name))} finished everything today. High five! 🙌` });
  for (const k of b.kids) { if (k.streak >= 3) turns.push({ text: `${k.name} is on a ${k.streak} day streak! 🔥 Keep it going!` }); if (k.level?.toNext > 0 && k.level.toNext <= 15) turns.push({ text: `${k.name} is only ${k.level.toNext} stars from level ${k.level.level + 1}! ⭐` }); }
  const next = b.events.find((e) => e.date === b.today && new Date(e.start) > now && !e.allDay); if (next && turns.length < 2) turns.push({ text: `Coming up: ${next.title} at ${next.timeLabel}. 📅` });
  // 3. Something fun, the same on every screen at the same time.
  const slot = Math.floor(mins / SLOT_MIN) + skip; const fun = [];
  const dow = now.getDay(); if (dow === 5) fun.push({ text: 'Happy Friday! 🎉 What should we do this weekend?' }); if (dow === 1) fun.push({ text: 'New week, new stars! ⭐ Let’s go!' }); if (dow === 0 || dow === 6) fun.push({ text: 'Weekend! 🎈 What’s the fun plan today?' });
  const wx = b.weather?.current; if (wx && wx.temp <= 32) fun.push({ text: `It's ${wx.temp}° outside. Even snowmen want hats today! ⛄` }); if (wx && wx.temp >= 88) fun.push({ text: `It's ${wx.temp}° out. Drink some water and find some shade! 💧` });
  if (pet) fun.push({ text: `${woof(b)}${pet} says hi! 🐾` }, { text: `${pet} would like a belly rub, please. 🐾` });
  const pool = funPool(); const pick = (n) => { const i = (daySeed(b.today) + n * 7) % pool.length; return pool[i]; };
  const funNow = slot % 5 === 4 && fun.length ? fun[Math.floor(slot / 5) % fun.length] : pick(slot);
  if (turns.length && slot % 2 === 0) return turns[Math.floor(slot / 2) % turns.length];
  return funNow;
}
export const mascotLine = (b, now) => mascotSay(b, now).text;
// The mascot's speech bubble. Tap a question to see and hear the answer; tap again for something new.
function MascotBubble({ b, now, style }) {
  const [skip, setSkip] = useState(0); const [open, setOpen] = useState(false);
  const line = mascotSay(b, now, skip); useEffect(() => setOpen(false), [line.text]);
  const tap = (e) => { e.stopPropagation(); if (line.answer && !open) { setOpen(true); chime('ok'); speak(line.answer.replace(/[\p{Extended_Pictographic}‍️]/gu, '')); } else if (!line.urgent) { setSkip((n) => n + 1); } else speak(line.text.replace(/[\p{Extended_Pictographic}‍️]/gu, '')); };
  return html`<button class=${'bubble' + (line.urgent ? ' urgent' : '') + (line.answer ? ' ask' : '')} style=${style} onClick=${tap}>${line.text}${line.answer ? (open ? html`<b class="ans">${line.answer}</b>` : html`<small class="tapme">${line.kind === 'joke' ? 'Tap me for the funny part!' : 'Tap me for the answer!'}</small>`) : ''}</button>`;
}

// A kid's week at a glance: one bar per day (stars earned, bonus, missed, still to earn), and tap a day
// to see its chores. Today is picked to start, so it doubles as today's progress.
const DAY1 = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
function WeekChart({ b, k }) {
  const w = k.week; const [sel, setSel] = useState(b.today); const day = w.days.find((d) => d.date === sel) || w.days[0];
  const tall = Math.max(1, ...w.days.map((d) => d.possible + d.bonus));
  const seg = (n, cls) => (n > 0 ? html`<i class=${cls} style=${{ height: (100 * n / tall) + '%' }}></i>` : '');
  const earnedAll = w.earned + w.bonusStars; const more = Math.max(0, w.canReach + w.bonusDollars - w.total);
  const state = (t) => (t.counted ? ['✓', 'got', `★ ${t.stars}`] : t.done ? ['✓', 'held', 'after the morning list'] : day.date < b.today ? ['✗', 'miss', 'missed'] : ['○', 'open', `★ ${t.stars} to earn`]);
  const name = day.date === b.today ? 'Today' : longDate(day.date).split(',')[0];
  return html`<div class="card group wkc" style=${{ '--kc': k.color }}><div class="hd"><b>My week</b><span>★ ${earnedAll} earned${w.left ? ` · ★ ${w.left} still to earn` : ''}</span></div>
    <div class="wk">${w.days.map((d) => html`<button class=${'col' + (d.date === sel ? ' sel' : '') + (d.date === b.today ? ' now' : '')} onClick=${() => setSel(d.date)} aria-label=${longDate(d.date)}>
      <span class="bar">${seg(d.open, 'o')}${seg(d.missed, 'm')}${seg(d.bonus, 'bn')}${seg(d.earned, 'e')}</span><span class="dl">${DAY1[fromYmd(d.date).getDay()]}</span></button>`)}</div>
    <div class="wkkey"><span><i class="e"></i>earned</span><span><i class="bn"></i>bonus</span><span><i class="m"></i>missed</span><span><i class="o"></i>still to earn</span></div>
    <div class="wkday"><div class="wkdh"><b>${name}</b><span>${day.scheduled || day.bonus ? `★ ${day.earned + day.bonus} earned${day.missed ? ` · ${day.missed} missed` : ''}${day.open ? ` · ★ ${day.open} to go` : ''}` : 'free day 🎈'}</span></div>
      ${day.items.map((t) => { const [mark, cls, note] = state(t); return html`<div class=${'wkit ' + cls}><span class="mk">${mark}</span><span class="em">${t.emoji}</span><span class="tt">${t.title}</span><small>${note}</small></div>`; })}
      ${day.bonus ? html`<div class="wkit got"><span class="mk">★</span><span class="em">🌟</span><span class="tt">Bonus quests</span><small>★ ${day.bonus}</small></div>` : ''}</div>
    ${w.max > 0 ? html`<div class="wkmoney"><b>${money(w.total)}</b> so far${more > 0 ? html` · up to <b>${money(w.total + more)}</b> if you finish the rest` : w.total >= w.max ? ' · the whole allowance! 🎉' : ''}</div>` : ''}</div>`;
}

// ---------- kids' bank ----------
// Counts a number up (or down) to its new value, for the money on the pay day screen.
function useCountUp(to, ms = 1300, from = 0) {
  const [v, setV] = useState(from);
  useEffect(() => { let raf; const t0 = performance.now(); const step = (t) => { const p = Math.min(1, (t - t0) / ms); setV(from + (to - from) * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf); }, [to, from]);
  return v;
}
const shortDay = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const moneyNote = (h) => h.dir === 'out' ? 'Cash handed over' : h.note === 'pay day' ? 'Pay day' : h.note === 'to savings jar' ? 'Saved from pay' : (h.note || 'Added');
// Pay day: coins rain down, the register goes cha-ching, and the kid picks cash or the bank.
// due and bal are the pay and bank as they were when the screen opened, so it stays put while the board refreshes.
function PayDay({ b, k, due, bal, refresh, onClose }) {
  const [done, setDone] = useState(null); const [busy, setBusy] = useState(false);
  useEffect(() => { cashSound(); const t = setTimeout(confetti, 350); return () => clearTimeout(t); }, []);
  const shown = useCountUp(due.total, 1400); const after = useCountUp(done ? done.balance : bal, 1200, bal);
  const coins = useMemo(() => Array.from({ length: 28 }, (_, i) => ({ left: Math.random() * 100, delay: Math.random() * 1.8, dur: 1.8 + Math.random() * 1.4, size: 24 + Math.random() * 26, e: i % 5 === 0 ? '💵' : '🪙' })), [done]);
  const pick = async (choice) => { if (busy) return; setBusy(true); try { const r = await api('/api/bank/payday', { kid: k.id, week: due.week, choice }); setDone(r); cashSound(); if (choice === 'bank') confetti(); refresh(); } catch (e) { toast(e.message); refresh(); onClose(); } finally { setBusy(false); } };
  const late = due.payDay !== b.today; const parts = [due.base ? money(due.base) + ' for chores' : '', due.bonus ? money(due.bonus) + ' from bonus stars' : ''].filter(Boolean).join(' + ');
  return html`<div class="ov payday" onClick=${(e) => e.stopPropagation()}>
    <div class="coins-rain" aria-hidden="true" key=${done ? 'b' : 'a'}>${coins.map((c) => html`<span style=${{ left: c.left + '%', animationDelay: c.delay + 's', animationDuration: c.dur + 's', fontSize: c.size + 'px' }}>${c.e}</span>`)}</div>
    <div class="sheet pdsheet">
      ${!done ? html`<div class="pdhead">Cha-ching! 💰</div><${Avatar} kid=${k} size="110px" />
        <p class="pdline">${late ? `${k.name}, here's your pay from the week to ${DAYN[fromYmd(due.payDay).getDay()]}!` : `It's pay day, ${k.name}! You earned`}</p>
        <div class="pdamt">${money(shown)}</div>${parts ? html`<p class="pdsub">${parts}</p>` : ''}
        <div class="pdbtns"><button class="pill big pdcash" disabled=${busy} onClick=${() => pick('cash')}>💵 Cash please</button><button class="pill sun big" disabled=${busy} onClick=${() => pick('bank')}>🏦 Bank it</button></div>
        <p class="pdsub">In your bank now: <b>${money(bal)}</b></p>
        <button class="pill ghost sm" onClick=${onClose}>Later</button>`
      : done.choice === 'bank' ? html`<div class="pdhead">Banked! 🏦</div><${Avatar} kid=${k} size="110px" /><p class="pdline">Your bank has</p><div class="pdamt">${money(after)}</div>
        ${k.goal ? html`<p class="pdsub">🎯 ${k.goal.title}: ${money(done.balance)} of ${money(k.goal.amount)}</p>` : ''}<p class="pdsub">Ask for cash any time from your page.</p>
        <button class="pill sun big" onClick=${onClose}>${done.more ? 'Next pay day ›' : 'Yay!'}</button>`
      : html`<div class="pdhead">Cash is coming! 💵</div><${Avatar} kid=${k} size="110px" /><p class="pdline">${grownups(b)} will hand you</p><div class="pdamt">${money(done.amount)}</div>
        <p class="pdsub">${done.asked ? 'It waits in your bank until then.' : `It's in your bank. Ask ${grownups(b)} for it.`}</p><button class="pill sun big" onClick=${onClose}>${done.more ? 'Next pay day ›' : 'OK!'}</button>`}
    </div></div>`;
}
// Ask for cash from the bank: pick an amount up to what's there (cash already asked for doesn't count twice).
function AskCash({ b, k, refresh, onClose }) {
  const max = k.bank.available; const low = Math.min(1, max); const [amt, setAmt] = useState(Math.min(max, 5)); const [busy, setBusy] = useState(false);
  const clamp = (v) => Math.round(Math.max(low, Math.min(max, v)) * 100) / 100;
  const send = async () => { setBusy(true); try { await api('/api/bank/request', { kid: k.id, amount: amt }); chime('win'); toast(`Asked! ${grownups(b)} will hand you ${money(amt)}.`); refresh(); onClose(); } catch (e) { toast(e.message); } finally { setBusy(false); } };
  return html`<div class="ov" onClick=${onClose}><div class="sheet asksheet" onClick=${(e) => e.stopPropagation()}><button class="close" onClick=${onClose}>×</button>
    <h3>💵 Ask for cash</h3><p class="meta">You have ${money(max)} you can ask for</p>
    <div class="askrow"><button class="pill lite" onClick=${() => setAmt(clamp(amt - 1))}>− $1</button><div class="askamt">${money(amt)}</div><button class="pill lite" onClick=${() => setAmt(clamp(amt + 1))}>+ $1</button></div>
    <div class="chips">${[1, 2, 5, 10, 20].filter((v) => v < max).map((v) => html`<button class=${amt === v ? 'on' : ''} onClick=${() => setAmt(v)}>${money(v)}</button>`)}<button class=${amt === max ? 'on' : ''} onClick=${() => setAmt(max)}>All ${money(max)}</button></div>
    <div class="btns"><button class="pill sun big" disabled=${busy || !(amt > 0)} onClick=${send}>Ask for ${money(amt)}</button></div>
    <p class="meta" style="font-size:13px">${grownups(b)} hands it over, then it comes out of your bank.</p></div></div>`;
}
function BankCard({ b, k, refresh, openPay }) {
  const bk = k.bank; const [ask, setAsk] = useState(false); const [hist, setHist] = useState(false);
  if (!bk?.on) return '';
  const waiting = bk.requests.filter((r) => r.status === 'pending'); const answered = bk.requests.filter((r) => r.status !== 'pending').slice(0, 2);
  return html`<div class="card group bankc"><div class="hd"><b>🏦 My bank</b><span>${grownups(b)} keeps it safe</span></div>
    <div class="bankrow"><div class="bankbal"><b>${money(bk.balance)}</b><small>${bk.pending ? `${money(bk.pending)} of it is cash on its way` : bk.balance ? 'saved up' : 'bank your pay to start saving'}</small></div>
      <div class="bankbtns">${k.payday ? html`<button class="pill sun" onClick=${openPay}>💰 Collect ${money(k.payday.total)}</button>` : ''}<button class="pill" disabled=${!(bk.available > 0)} onClick=${() => setAsk(true)}>💵 Ask for cash</button></div></div>
    ${waiting.map((r) => html`<div class="bankreq">⏳ ${money(r.amount)} cash asked for, waiting for ${grownups(b)}</div>`)}
    ${answered.map((r) => html`<div class="bankreq">${r.status === 'approved' ? `✅ Got ${money(r.amount)} cash` : `🙅 ${money(r.amount)} cash not this time, it's still in your bank`}</div>`)}
    <button class="bankmore" onClick=${() => setHist(!hist)}>${hist ? 'Hide' : 'See'} money in and out</button>
    ${hist ? html`<div class="bankhist">${bk.history.length ? bk.history.map((h) => html`<div class=${'bh ' + h.dir}><span class="tt">${moneyNote(h)}</span><small>${shortDay(h.at)}</small><b>${h.dir === 'in' ? '+' : '−'}${money(h.amount)}</b></div>`) : html`<div class="bh"><span class="tt">Nothing yet. Bank your pay on pay day to start saving!</span></div>`}</div>` : ''}
    ${ask ? html`<${AskCash} b=${b} k=${k} refresh=${refresh} onClose=${() => setAsk(false)} />` : ''}</div>`;
}

function KidPage({ b, k, refresh, setPage, startTimer, withPin, openPay }) {
  const now = new Date(); const school = b.isSchoolDay; const morningOpen = school && minsUntil(k.leaveTime, now) > -30;
  const groups = [['Before school', k.today.filter((t) => t.when === 'morning')], ['After school', k.today.filter((t) => t.when !== 'morning' && t.kind === 'task')], ['To-dos', k.today.filter((t) => t.kind === 'todo')]].filter(([, l]) => l.length);
  const tap = async (t) => {
    if (t.doneByOther) { toast(`${b.kids.find((x) => x.id === t.doneBy)?.name || 'Someone else'} already did that one`); return; }
    try { if (!t.done) { await api('/api/check', { kid: k.id, id: t.id, date: b.today, done: true }); chime('ok'); const grp = groups.find(([, l]) => l.includes(t)); if (grp && grp[1].every((x) => x === t || x.done)) { confetti(); chime('win'); } }
      else { try { await api('/api/check', { kid: k.id, id: t.id, date: b.today, done: false }); } catch (e) { if (e.needPin) { const r = await withPin((pin) => api('/api/check', { kid: k.id, id: t.id, date: b.today, done: false }, pin)); if (!r) return; } else throw e; } }
      refresh(); } catch (e) { toast(e.message); }
  };
  const claim = async (q) => { try { const r = await api('/api/quest/claim', { kid: k.id, questId: q.id }); chime('ok'); toast(r.status === 'approved' ? `★ ${q.stars} for ${k.name}!` : `Claimed! ${grownups(b)} will approve it.`); refresh(); } catch (e) { toast(e.message); } };
  const claimed = (q) => k.weekClaims.find((c) => c.date === b.today && c.title === q.title);
  const pendingStars = k.rewardRequests.filter((x) => x.status === 'pending').reduce((s2, x) => s2 + x.cost, 0);
  const askReward = async (r, can) => { if (!can) { toast(`${r.cost - (k.wardrobe.balance - pendingStars)} more stars to go!`); return; } try { await api('/api/reward/request', { kid: k.id, rewardId: r.id }); chime('win'); toast(`Asked! ${grownups(b)} will say yes or no.`); refresh(); } catch (e) { toast(e.message); } };
  return html`<div class="page"><div class="kid">
    <div class="card left"><${Avatar} kid=${k} size="220px" /><div class="name">${k.name}<small>Level ${k.level.level} ${k.level.name} · ${k.level.toNext} ★ to level ${k.level.level + 1} ${k.streak ? ` · 🔥 ${k.streak} day streak` : ''}</small></div>
      <div class="lvbar"><div class="bar"><i style=${{ width: Math.round(100 * k.level.into / k.level.per) + '%', background: k.color }}></i></div><small><span>${k.lifetime} ★ all time</span><span>${k.level.into} / ${k.level.per}</span></small></div>
      <div class="money"><b>${money(k.week.total)}</b><span>${payLabel(b) === 'today' ? 'pay day today! 💰' : 'pay day ' + payLabel(b)}</span></div><div class="days">${k.week.days.map((d) => html`<i class=${d.status} title=${d.date}></i>`)}</div>
      ${k.goal ? html`<div class="lvbar" style="margin-top:4px"><small><span>🎯 ${k.goal.title}</span><span>${money(k.jar)} / ${money(k.goal.amount)}</span></small><div class="bar"><i style=${{ width: Math.min(100, Math.round(100 * k.jar / (k.goal.amount || 1))) + '%', background: '#ffc857' }}></i></div></div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><button class="pill" onClick=${() => setPage('wardrobe', k.id)}>👕 Wardrobe</button><button class="pill lite" onClick=${() => setPage('home')}>🏠 Home</button></div></div>
    <div class="lists" style=${{ '--kc': k.color }}>
      ${groups.map(([name, list]) => html`<div class="card group"><div class="hd"><b>${name}</b><span>${list.filter((t) => t.done).length} of ${list.length}${name === 'Before school' && !morningOpen ? ' · done for today' : ''}</span></div>
        ${list.map((t) => html`<button class=${'ti' + (t.done ? ' done' : '') + (t.doneByOther ? ' other' : '')} onClick=${() => tap(t)}><span class="bx">${t.done ? '✓' : ''}</span><span class="em">${t.emoji}</span><span class="tt">${t.title}${t.shared ? html`<small>${t.doneByOther ? 'done by ' + (b.kids.find((x) => x.id === t.doneBy)?.name || 'someone else') : 'shared, first to finish earns it'}</small>` : t.turn ? html`<small>your turn today</small>` : ''}</span>${t.timerMin && !t.done ? html`<span class="timer" onClick=${(e) => { e.stopPropagation(); startTimer(t.timerMin * 60, t.title, () => tap(t)); }}>⏱ ${t.timerMin} min</span>` : ''}<span class="st">★ ${t.stars}</span></button>`)}</div>`)}
      ${!k.today.length ? html`<div class="card group"><div class="hd"><b>Nothing scheduled today</b><span>free day 🎈</span></div></div>` : ''}
      <${BankCard} b=${b} k=${k} refresh=${refresh} openPay=${openPay} />
      <${WeekChart} b=${b} k=${k} />
      <${BrainCard} b=${b} k=${k} refresh=${refresh} />
      <div class="card group"><div class="hd"><b>Bonus quests</b><span>tap to claim · ${grownups(b)} approves</span></div><div class="quests">${(b.config.quests || []).filter((q) => q.who === 'both' || q.who === k.id).map((q) => { const c = claimed(q); return html`<button class=${'quest' + (c ? ' ' + c.status : '')} disabled=${!!c} onClick=${() => claim(q)}>${q.emoji} ${q.title}<span>${c ? (c.status === 'pending' ? 'waiting' : c.status === 'approved' ? `★ ${q.stars} ✓` : 'not today') : '★ ' + q.stars}</span></button>`; })}</div></div>
      <div class="card group"><div class="hd"><b>Spend my stars</b><span>★ ${k.wardrobe.balance - pendingStars} to spend · ${grownups(b)} says yes</span></div><div class="quests">${(b.config.rewards || []).filter((r) => r.who === 'both' || r.who === k.id).map((r) => { const p = k.rewardRequests.find((x) => x.reward === r.id && x.status === 'pending'); const can = k.wardrobe.balance - pendingStars >= r.cost; return html`<button class=${'quest' + (p ? ' pending' : '') + (!p && !can ? ' locked' : '')} disabled=${!!p} onClick=${() => askReward(r, can)}>${r.emoji} ${r.title}<span>${p ? 'asked!' : '★ ' + r.cost}</span></button>`; })}</div>
        ${k.rewardRequests.filter((x) => x.status !== 'pending').slice(0, 3).map((x) => html`<div style="font-size:12px;font-weight:800;color:var(--muted);margin-top:6px">${x.status === 'approved' ? '✅' : '🙅'} ${x.title} · ${x.status === 'approved' ? 'yes!' : 'not this time'}</div>`)}</div>
    </div></div></div>`;
}

const KINDS = [['hair', 'Hair'], ['hairColor', 'Hair color'], ['skin', 'Skin'], ['eyes', 'Eyes'], ['brows', 'Brows'], ['mouth', 'Smile'], ['face', 'Freckles'], ['glasses', 'Glasses'], ['earrings', 'Earrings'], ['bg', 'Backgrounds'], ['pet', 'Pets'], ['extra', 'Extras'], ['gear', 'Gear']];
// Every face option in the adventurer set is free.
const variants = (n) => Array.from({ length: n }, (_, i) => 'variant' + String(i + 1).padStart(2, '0'));
export const SKINS = ['ffdbb4', 'f2d3b1', 'e8c1a0', 'ecad80', 'c68e5f', '9e5622', '763900', '5a3418']; const EYES = variants(26); const MOUTHS = variants(30); const BROWS = variants(15);
const FEATURES = [['', 'Plain', '🙂'], ['blush', 'Blush', '🌸'], ['freckles', 'Freckles', '✨'], ['birthmark', 'Beauty mark', '•'], ['mustache', 'Silly mustache', '🥸']];
const TOGGLES = ['glasses', 'earrings', 'pet', 'extra', 'gear'];
function Wardrobe({ b, kidId, refresh, setPage }) {
  const [kid, setKid] = useState(kidId || b.kids[0].id); const k = b.kids.find((x) => x.id === kid) || b.kids[0]; const [tab, setTab] = useState('hair');
  const [look, setLook] = useState({ ...k.avatar, ...k.wardrobe.look }); useEffect(() => setLook({ ...k.avatar, ...k.wardrobe.look }), [kid, b.now]);
  const cat = b.config.wardrobe.catalog; const owned = new Set(k.wardrobe.owned);
  const have = (it) => it.cost === 0 && !it.minLevel && !it.prizeOnly || owned.has(it.id);
  const save = async (lk) => { setLook(lk); await api('/api/wardrobe/look', { kid: k.id, look: lk }); refresh(); };
  const pick = async (it) => {
    if (!have(it)) { if (it.prizeOnly) return toast('This one comes with a weekly prize'); if (it.minLevel && k.level.level < it.minLevel) return toast(`Reach level ${it.minLevel} to unlock`); if (k.wardrobe.balance < it.cost) return toast(`Need ${it.cost - k.wardrobe.balance} more stars`);
      if (!confirm(`Unlock ${it.label} for ${it.cost} stars?`)) return; try { await api('/api/wardrobe/buy', { kid: k.id, itemId: it.id }); chime('win'); confetti(); } catch (e) { return toast(e.message); } }
    const lk = { ...look }; if (TOGGLES.includes(it.kind) && lk[it.kind] === it.value) delete lk[it.kind]; else lk[it.kind] = it.value; save(lk);
  };
  const items = cat.filter((i) => i.kind === tab);
  return html`<div class="page"><div class="wkhead"><h2>${k.name}'s wardrobe</h2><div class="seg">${b.kids.map((x) => html`<button class=${x.id === kid ? 'on' : ''} onClick=${() => setKid(x.id)}>${x.name}</button>`)}</div><div class="coins" style="margin-left:auto">★ ${k.wardrobe.balance}<span>to spend</span></div></div>
    <div class="ward"><div class="card stage"><${Avatar} kid=${k} look=${look} size="260px" /><div style="display:flex;gap:8px"><button class="pill" onClick=${() => { chime('ok'); toast('Saved!'); setPage(k.id); }}>Done</button><button class="pill lite" onClick=${() => { const r = (l) => l[Math.random() * l.length | 0]; const lk = { ...look, eyes: r(EYES), mouth: r(MOUTHS), eyebrows: r(BROWS) }; const hairs = cat.filter((i) => i.kind === 'hair' && have(i)); lk.hair = hairs[Math.random() * hairs.length | 0].value; save(lk); }}>🎲 Surprise me</button></div></div>
      <div><div class="tabs">${KINDS.map(([id, lab]) => html`<button class=${tab === id ? 'on' : ''} onClick=${() => setTab(id)}>${lab}</button>`)}</div>
        <div class="grid">
          ${tab === 'skin' ? SKINS.map((s) => html`<button class=${'item' + (look.skinColor === s ? ' sel' : '')} onClick=${() => save({ ...look, skinColor: s })}><span class="sw" style=${{ background: '#' + s }}></span></button>`) : ''}
          ${tab === 'eyes' ? EYES.map((e) => html`<button class=${'item' + (look.eyes === e ? ' sel' : '')} onClick=${() => save({ ...look, eyes: e })}><div class="zoomface" dangerouslySetInnerHTML=${{ __html: avatarSvg({ ...look, eyes: e }) }}></div></button>`) : ''}
          ${tab === 'brows' ? BROWS.map((e) => html`<button class=${'item' + (look.eyebrows === e ? ' sel' : '')} onClick=${() => save({ ...look, eyebrows: e })}><div class="zoomface" dangerouslySetInnerHTML=${{ __html: avatarSvg({ ...look, eyebrows: e }) }}></div></button>`) : ''}
          ${tab === 'mouth' ? MOUTHS.map((m) => html`<button class=${'item' + (look.mouth === m ? ' sel' : '')} onClick=${() => save({ ...look, mouth: m })}><div class="zoomface low" dangerouslySetInnerHTML=${{ __html: avatarSvg({ ...look, mouth: m }) }}></div></button>`) : ''}
          ${tab === 'face' ? FEATURES.map(([f, lab, e]) => html`<button class=${'item' + ((look.features || '') === f ? ' sel' : '')} onClick=${() => save({ ...look, features: f })}><div style="width:70px;height:70px" dangerouslySetInnerHTML=${{ __html: avatarSvg({ ...look, features: f }) }}></div><small>${lab}</small></button>`) : ''}
          ${items.map((it) => { const ok = have(it); const on = look[it.kind] === it.value; return html`<button class=${'item' + (on ? ' sel' : '') + (ok ? '' : ' lock')} onClick=${() => pick(it)}>
            ${it.kind === 'hair' ? html`<div style="width:74px;height:74px" dangerouslySetInnerHTML=${{ __html: avatarSvg({ ...look, hair: it.value }) }}></div>` : it.kind === 'hairColor' || it.kind === 'bg' ? html`<span class="sw" style=${{ background: bgFill(it.value) }}></span>` : it.kind === 'glasses' || it.kind === 'earrings' ? html`<div style="width:74px;height:74px" dangerouslySetInnerHTML=${{ __html: avatarSvg({ ...look, [it.kind]: it.value }) }}></div>` : html`<span class="e">${it.value}</span>`}
            <small>${it.label}</small>${!ok ? html`<span class="lk">${it.prizeOnly ? 'Prize' : it.minLevel && k.level.level < it.minLevel ? 'Lv ' + it.minLevel : '★ ' + it.cost}</span>` : ''}</button>`; })}
        </div></div></div></div>`;
}

const AISLES = ['produce', 'bakery', 'deli', 'meat', 'dairy', 'frozen', 'pantry', 'pets', 'household', 'personal', 'other'];
// Sends the open grocery items, one per line, to WhatsApp, Messages, email, or the phone's share sheet (Notes and the rest).
function ShareSheet({ items, onClose }) {
  const today = new Date(); const text = `🛒 Grocery list, ${DAYN[today.getDay()]} ${MON[today.getMonth()]} ${today.getDate()}\n\n${items.map((g) => '• ' + g.text.charAt(0).toUpperCase() + g.text.slice(1)).join('\n')}`;
  const enc = encodeURIComponent(text); const ios = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;
  const canShare = !!navigator.share; const go = (url) => { window.location.href = url; onClose(); };
  const copy = async () => { try { await navigator.clipboard.writeText(text); toast('Copied! Paste it anywhere.'); chime('ok'); onClose(); } catch { toast('Could not copy on this device'); } };
  const more = async () => { try { await navigator.share({ title: 'Grocery list', text }); onClose(); } catch (e) { if (e?.name !== 'AbortError') toast('Could not open sharing'); } };
  return html`<div class="ov" onClick=${onClose}><div class="sheet shsheet" onClick=${(e) => e.stopPropagation()}><button class="close" onClick=${onClose}>×</button>
    <h3>📤 Send the list</h3><p class="meta">${items.length} item${items.length === 1 ? '' : 's'}, one per line</p>
    <div class="shbtns">
      <button class="shb wa" onClick=${() => go('https://wa.me/?text=' + enc)}><span>💬</span>WhatsApp</button>
      <button class="shb" onClick=${() => go((ios ? 'sms:&body=' : 'sms:?body=') + enc)}><span>💭</span>Messages</button>
      <button class="shb" onClick=${() => go('mailto:?subject=' + encodeURIComponent('Grocery list') + '&body=' + enc)}><span>✉️</span>Email</button>
      ${canShare ? html`<button class="shb" onClick=${more}><span>📝</span>Notes and more</button>` : ''}
      <button class="shb" onClick=${copy}><span>📋</span>Copy</button>
    </div>
    <pre class="shprev">${text}</pre></div></div>`;
}
function Groceries({ b, refresh }) {
  const [txt, setTxt] = useState(''); const [sharing, setSharing] = useState(false); const list = b.groceries; const open = list.filter((g) => !g.done).sort((a, c) => AISLES.indexOf(a.aisle) - AISLES.indexOf(c.aisle)); const done = list.filter((g) => g.done);
  const add = async () => { if (!txt.trim()) return; await api('/api/grocery', { text: txt, by: 'board' }); setTxt(''); chime('ok'); refresh(); };
  const often = ['Milk', 'Bread', 'Bananas', 'Eggs', 'Yogurt tubes', 'Apples', 'Cheese sticks', ...(b.config.family.dog && !CHARACTER.has(b.config.family.petKind) ? [`${b.config.family.dog}'s food`] : ['Cereal'])];
  return html`<div class="page"><div class="wkhead"><h2>Groceries</h2><span style="color:var(--muted);font-weight:800">${open.length} things</span>${open.length ? html`<button class="pill sm wa" style="margin-left:auto" onClick=${() => setSharing(true)}>📤 Send list</button>` : ''}${done.length ? html`<button class="pill lite sm" style=${open.length ? '' : 'margin-left:auto'} onClick=${async () => { await api('/api/grocery/clear', {}); refresh(); }}>🧹 Clear ${done.length} checked</button>` : ''}</div>
    <div class="groc"><div class="card glist">${[...open, ...done].map((g) => html`<button class=${'gi' + (g.done ? ' done' : '')} onClick=${async () => { await api(`/api/grocery/${g.id}/toggle`, {}); refresh(); }}><span class="bx">${g.done ? '✓' : ''}</span>${g.text}<em>${g.aisle}</em>${g.done ? html`<span class="x" onClick=${async (e) => { e.stopPropagation(); await del(`/api/grocery/${g.id}`); refresh(); }}>×</span>` : ''}</button>`)}${!list.length ? html`<div style="padding:20px;color:var(--muted);font-weight:800">The list is empty. Add something →</div>` : ''}</div>
      <div class="card gadd"><div class="lbl">Add something</div><input class="gbox" value=${txt} onInput=${(e) => setTxt(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && add()} placeholder="Oat milk, bananas, poop bags…" /><div class="hint">A few at once with commas, or hold the mic and say them. The aisle is picked for you.</div><button class="pill" style="margin-top:10px" onClick=${add}>Add</button>
        <div class="lbl" style="margin-top:18px">Often bought</div><div class="chips">${often.map((o) => html`<button onClick=${async () => { await api('/api/grocery', { text: o, by: 'board' }); refresh(); }}>${o}</button>`)}</div></div></div>
    ${sharing ? html`<${ShareSheet} items=${open} onClose=${() => setSharing(false)} />` : ''}</div>`;
}

// True on phone-width screens, where seven time columns would be too cramped.
function useNarrow(px = 760) { const q = () => window.matchMedia(`(max-width:${px}px)`).matches; const [n, setN] = useState(q()); useEffect(() => { const f = () => setN(q()); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []); return n; }
const toMin = (hhmm) => { const [h, m] = (hhmm || '0:0').split(':').map(Number); return h * 60 + m; };
// Lay out one day's timed events: side by side when they overlap, full width otherwise.
function placeDay(evs, d) {
  const items = evs.map((e) => { const s = e.date === d ? toMin(e.timeLabel) : 0; let en = e.endDate === d ? toMin(e.endLabel) : 1440; if (en <= s) en = Math.min(1440, s + 30); return { e, s, en: Math.max(en, s + 20) }; }).sort((a, c) => a.s - c.s || c.en - a.en);
  let group = [], groupEnd = -1; const done = [];
  const close = () => { const cols = Math.max(...group.map((g) => g.col)) + 1; for (const g of group) done.push({ ...g, cols }); group = []; };
  for (const it of items) {
    if (group.length && it.s >= groupEnd) close();
    const used = new Set(group.filter((g) => g.en > it.s).map((g) => g.col)); let col = 0; while (used.has(col)) col++;
    group.push({ ...it, col }); groupEnd = Math.max(groupEnd, it.en);
  }
  if (group.length) close();
  return done;
}
const HOUR_PX = 46;
function TimeGrid({ b, days, evOn, wx, openEv, extras, dinner }) {
  const [now, setNow] = useState(new Date()); useEffect(() => { const i = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(i); }, []);
  const timed = (d) => evOn(d).filter((e) => !e.allDay); const allDay = (d) => evOn(d).filter((e) => e.allDay);
  // Show 06:00 to 21:00, stretched to fit anything earlier or later this week.
  const placed = days.map((d) => placeDay(timed(d), d)); const all = placed.flat();
  const h0 = Math.min(6, ...all.map((p) => Math.floor(p.s / 60))); const h1 = Math.max(21, ...all.map((p) => Math.ceil(p.en / 60)));
  const hours = Array.from({ length: h1 - h0 }, (_, i) => h0 + i); const top = (m) => ((m - h0 * 60) / 60) * HOUR_PX;
  const nowMin = now.getHours() * 60 + now.getMinutes(); const hasAllDay = days.some((d) => allDay(d).length || extras(d).length);
  const dp = (d) => { const x = wx(d); const wd = fromYmd(d).getDay(); return html`<div class=${'tgh' + (d === b.today ? ' today' : wd === 0 || wd === 6 ? ' wkend' : '')}><div class="dn">${DAYN[wd].slice(0, 3)}<b>${fromYmd(d).getDate()}</b></div>${x ? html`<div class="wxd"><span>${x.icon}</span><b>${x.high}°</b> / ${x.low}°</div>` : ''}</div>`; };
  return html`<div class="tg">
    <div class="tgrow"><div class="tgl"></div>${days.map(dp)}</div>
    ${hasAllDay ? html`<div class="tgrow tgall"><div class="tgl">all day</div>${days.map((d) => html`<div class=${'tgc' + (d === b.today ? ' today' : '')}>${allDay(d).map((e) => html`<button class="ch2" style=${{ borderLeftColor: e.color }} onClick=${() => openEv(e)}><span class="e">${e.emoji}</span><span class="tt">${e.title}</span>${(e.dots || []).map((x) => html`<span class="pp" title=${x.name} style=${{ background: x.color }}>${x.letter}</span>`)}</button>`)}${extras(d)}</div>`)}</div>` : ''}
    <div class="tgrow tgbody" style=${{ height: hours.length * HOUR_PX + 'px' }}>
      <div class="tgl">${hours.map((h) => html`<div class="hr" style=${{ top: top(h * 60) + 'px' }}>${pad(h)}:00</div>`)}</div>
      ${days.map((d, i) => html`<div class=${'tgcol' + (d === b.today ? ' today' : '')}>
        ${hours.map((h) => html`<div class="line" style=${{ top: top(h * 60) + 'px' }}></div>`)}
        ${placed[i].map((p) => { const ht = top(p.en) - top(p.s); return html`<button class=${'tev' + (ht < 34 ? ' short' : ht < 60 ? ' mid' : '')} title=${p.e.title} onClick=${() => openEv(p.e)} style=${{ top: top(p.s) + 1 + 'px', height: ht - 2 + 'px', left: `calc(${(p.col / p.cols) * 100}% + 2px)`, width: `calc(${100 / p.cols}% - 4px)`, borderLeftColor: p.e.color, background: p.e.color + '22' }}>
          <span class="tt"><span class="e">${p.e.emoji}</span> ${p.e.title}</span>${ht >= 34 ? html`<small>${p.e.date === d ? p.e.timeLabel : ''}${p.e.endDate === d && p.e.endLabel ? '–' + p.e.endLabel : ''}${p.e.place ? ' · leave ' + p.e.place.leaveBy : ''}</small>` : ''}
          ${(p.e.dots || []).length && ht >= 34 ? html`<span class="tdots">${p.e.dots.map((x) => html`<span class="pp" title=${x.name} style=${{ background: x.color }}>${x.letter}</span>`)}</span>` : ''}</button>`; })}
        ${d === b.today && nowMin >= h0 * 60 && nowMin <= h1 * 60 ? html`<div class="nowline" style=${{ top: top(nowMin) + 'px' }}></div>` : ''}
      </div>`)}
    </div>
    <div class="tgrow tgdin"><div class="tgl">🍽️</div>${days.map((d) => html`<div class="tgc">${dinner(d)}</div>`)}</div>
  </div>`;
}
function Week({ b, openEv, refresh, withPin }) {
  const [mode, setMode] = useState('week'); const [off, setOff] = useState(0); const w = b.weather; const kids = b.kids; const par = b.config.family.parents;
  const wk = addDays(b.calWeekStart || b.weekStart, off * 7); const days = Array.from({ length: 7 }, (_, i) => addDays(wk, i));
  const evOn = (d) => b.events.filter((e) => e.date <= d && e.endDate >= d); const meal = (d) => b.meals.find((m) => m.date === d); const wx = (d) => w?.days.find((x) => x.date === d);
  const who = (e) => { const k = kids.find((x) => e.people.includes(x.id)); const p = par.find((x) => e.people.includes(x.id)); return k ? [k.name[0], k.color] : p ? [p.name[0], p.color] : null; };
  const [mealDay, setMealDay] = useState(null); const setMeal = (d) => setMealDay(d);
  const coming = useMemo(() => { const out = []; const cds = (b.config.countdowns || []); for (const c of cds) if (c.date >= b.today) out.push({ t: c.title, e: c.emoji || '📅', d: c.date }); for (const e of b.events) if (e.date > b.today && /party|birthday|recital|trip|vacation|holiday|thanksgiving|christmas|halloween|first day|last day|concert|game day/i.test(e.title) && !out.find((x) => x.t === e.title)) out.push({ t: e.title, e: e.emoji, d: e.date }); out.push({ t: 'Pay day', e: '💰', d: b.payDay || addDays(b.weekStart, 6) }); return out.sort((a, c) => a.d.localeCompare(c.d)).slice(0, 6); }, [b]);
  const dd = (s) => Math.round((fromYmd(s) - fromYmd(b.today)) / 86400000);
  const narrow = useNarrow();
  const extras = (d) => html`${b.todos.filter((t) => t.date === d && !t.done_at).map((t) => html`<div class="ch2 todo"><span class="e">📌</span><span class="tt">${t.title}<small>${kids.find((k) => k.id === t.kid)?.name || 'both'}</small></span></div>`)}
        ${d === b.payDay ? html`<div class="ch2 prize"><span class="e">💰</span><span class="tt">Pay day<small>${b.config.prize.emoji} prize if earned</small></span></div>` : ''}`;
  const dinner = (d) => html`<button class="din" onClick=${() => setMeal(d)}>${meal(d) ? html`${meal(d).emoji || '🍽️'} ${meal(d).text}<small>${meal(d).who || ''}</small>` : html`<span style="color:var(--muted)">🍽️ dinner?</span>`}</button>`;
  return html`<div class="page"><div class="wkhead"><h2>${mode === 'month' ? MONL[fromYmd(wk).getMonth()] + ' ' + fromYmd(wk).getFullYear() : mode === 'day' ? longDate(addDays(b.today, off)) : `${MON[fromYmd(wk).getMonth()]} ${fromYmd(wk).getDate()} to ${MON[fromYmd(days[6]).getMonth()]} ${fromYmd(days[6]).getDate()}`}</h2>
      <div class="seg2"><button class=${mode === 'day' ? 'on' : ''} onClick=${() => { setMode('day'); setOff(0); }}>Day</button><button class=${mode === 'week' ? 'on' : ''} onClick=${() => { setMode('week'); setOff(0); }}>Week</button><button class=${mode === 'month' ? 'on' : ''} onClick=${() => { setMode('month'); setOff(0); }}>Month</button></div>
      <div class="seg2"><button onClick=${() => setOff(off - 1)}>‹</button><button onClick=${() => setOff(0)}>today</button><button onClick=${() => setOff(off + 1)}>›</button></div>
      <div class="legend">${kids.map((k) => html`<span style=${{ color: k.color }}>● ${k.name}</span>`)}${par.map((p) => html`<span style=${{ color: p.color }}>● ${p.name}</span>`)}<span style="color:#1f3a5f">● Family</span></div></div>
    ${mode === 'week' ? (narrow ? html`<div class="wk2">${days.filter((d) => off !== 0 || d >= b.today).map((d) => { const x = wx(d); const wd = fromYmd(d).getDay(); return html`<div class=${'wd2' + (d === b.today ? ' today' : wd === 0 || wd === 6 ? ' wkend' : '')}><div class="dh"><div class="dn">${DAYN[wd].slice(0, 3)}<b>${fromYmd(d).getDate()}</b></div>${x ? html`<div class="wxd"><span>${x.icon}</span><b>${x.high}°</b> / ${x.low}°</div>` : ''}</div>
        ${evOn(d).map((e) => html`<button class="ch2" style=${{ borderLeftColor: e.color }} onClick=${() => openEv(e)}><span class="e">${e.emoji}</span><span class="tt">${e.title}<small>${e.timeLabel}${e.place ? ' · leave ' + e.place.leaveBy : ''}</small></span>${(e.dots || []).map((d) => html`<span class="pp" title=${d.name} style=${{ background: d.color }}>${d.letter}</span>`)}</button>`)}
        ${extras(d)}
        ${dinner(d)}</div>`; })}</div>` : html`<${TimeGrid} b=${b} days=${days} evOn=${evOn} wx=${wx} openEv=${openEv} extras=${extras} dinner=${dinner} />`) : ''}
    ${mode === 'week' ? html`
      <div class="coming">${coming.map((c) => html`<div>${c.e} ${c.t}<b>${dd(c.d)}<small> day${dd(c.d) === 1 ? '' : 's'}</small></b></div>`)}</div>` : ''}
    ${mode === 'month' ? (() => { const first = fromYmd(wk); const m0 = new Date(first.getFullYear(), first.getMonth() + off * 0, 1); const monthStart = ymdLocal(new Date(fromYmd(b.today).getFullYear(), fromYmd(b.today).getMonth() + off, 1)); const ms = fromYmd(monthStart); const gridStart = addDays(monthStart, -((ms.getDay() - b.config.week.startsOn + 7) % 7)); const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)); return html`<div class="month">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((n) => html`<div class="lbl" style="text-align:center">${n}</div>`)}${cells.map((d) => { const x = wx(d); const inM = d.slice(0, 7) === monthStart.slice(0, 7); return html`<div class=${'md' + (d === b.today ? ' today' : '') + (inM ? '' : ' other')}><div class="n"><span>${fromYmd(d).getDate()}</span><span>${x ? x.icon : ''}${meal(d) ? ' ' + (meal(d).emoji || '🍽️') : ''}</span></div>${evOn(d).slice(0, 4).map((e) => html`<div class="e" style=${{ borderLeftColor: e.color }} onClick=${() => openEv(e)}>${e.allDay ? '' : e.timeLabel + ' '}${e.title}</div>`)}${evOn(d).length > 4 ? html`<div class="e">+${evOn(d).length - 4} more</div>` : ''}</div>`; })}</div>`; })() : ''}
    ${mealDay ? html`<${MealSheet} date=${mealDay} meal=${meal(mealDay)} onClose=${() => setMealDay(null)} refresh=${refresh} />` : ''}
    ${mode === 'day' ? (() => { const d = addDays(b.today, off); const x = wx(d); return html`<div class="dayv">${x ? html`<div class="card ev"><span class="tm">${x.icon}</span><span class="tt">${x.label}, high ${x.high}°, low ${x.low}°<small>rain ${x.rainPct}% · sunrise ${x.sunrise} · sunset ${x.sunset}</small></span></div>` : ''}${evOn(d).map((e) => html`<button class="card ev" onClick=${() => openEv(e)}><span class="tm">${e.timeLabel}</span><span class="pip" style=${{ background: e.color }}></span><span class="tt">${e.emoji} ${e.title}<small>${e.who}${e.location ? ' · ' + e.location : ''}${e.place ? ' · leave by ' + e.place.leaveBy : ''}</small></span></button>`)}${meal(d) ? html`<div class="card ev"><span class="tm">${meal(d).emoji}</span><span class="tt">Dinner: ${meal(d).text}</span></div>` : ''}${!evOn(d).length ? html`<div class="card ev"><span class="tt">Nothing on the calendar 🎈</span></div>` : ''}</div>`; })() : ''}
  </div>`;
}

function MealSheet({ date, meal, onClose, refresh }) {
  const [text, setText] = useState(meal?.text || ''); const [ing, setIng] = useState(meal?.ingredients || '');
  const save = async () => { await put('/api/meal', { date, text, ingredients: ing, who: 'board' }); refresh(); onClose(); };
  return html`<div class="ov" onClick=${onClose}><div class="sheet" style="width:480px" onClick=${(e) => e.stopPropagation()}><button class="close" onClick=${onClose}>×</button><h3>🍽️ Dinner on ${longDate(date)}</h3>
    <input class="gbox" style="margin-top:12px" value=${text} onInput=${(e) => setText(e.target.value)} placeholder="Tacos" onKeyDown=${(e) => e.key === 'Enter' && save()} />
    <input class="gbox" style="margin-top:8px;border-color:#cfe5d6" value=${ing} onInput=${(e) => setIng(e.target.value)} placeholder="ingredients, comma separated (optional)" />
    <div class="btns"><button class="pill" onClick=${save}>Save</button>${meal ? html`<button class="pill danger" onClick=${async () => { await put('/api/meal', { date, text: '' }); refresh(); onClose(); }}>Remove</button>` : ''}${meal?.ingredients ? html`<button class="pill lite" onClick=${async () => { await api('/api/meal/shop', { date }); toast('Added to groceries'); }}>🛒 Add ingredients to groceries</button>` : ''}</div></div></div>`;
}
// ---------- feedback ----------
function FeedbackSheet({ b, page, onClose }) {
  const [who, setWho] = useState(localStorage.getItem('fb-who') || ''); const [text, setText] = useState(''); const [rec, setRec] = useState(false); const [sent, setSent] = useState(null);
  const people = [...b.config.family.parents.map((p) => p.name), ...b.kids.map((k) => k.name)];
  const talk = async () => { if (rec) { dictate.stop && dictate.stop(); return; } setRec(true); const base = text ? text.trim() + ' ' : ''; const out = await dictate({ onInterim: (t) => setText(base + t) }); setRec(false); if (out) setText(base + out); };
  const micOff = () => { if (dictate.stop) dictate.stop(); };
  useEffect(() => micOff, []); // closing the sheet always turns the mic off
  const send = async () => { if (!text.trim()) return; micOff(); try { const r = await api('/api/feedback', { text: text.trim(), from: who, page }); localStorage.setItem('fb-who', who); chime('win'); setSent(r.issueUrl || true); } catch (e) { toast(e.message); } };
  return html`<div class="ov" onClick=${onClose}><div class="sheet" style="width:560px" onClick=${(e) => e.stopPropagation()}><button class="close" onClick=${onClose}>×</button>
    ${sent ? html`<h3>💛 Thank you!</h3><p style="font-weight:800;color:var(--ink2)">We got it. Ideas like yours make the board better for every family.${sent !== true ? html` <a target="_blank" href=${sent}>See your idea</a>` : ''}</p><div class="btns"><button class="pill" onClick=${onClose}>Done</button></div>` : html`
    <h3>💬 Feedback</h3><p style="font-weight:800;color:var(--muted);margin:4px 0 10px">Something confusing, broken, or an idea? Say it or type it.</p>
    <div class="chips" style="margin:0 0 10px">${people.map((n) => html`<button class=${who === n ? 'on' : ''} style=${who === n ? { background: '#1f3a5f', color: '#fff' } : {}} onClick=${() => setWho(n)}>${n}</button>`)}</div>
    <textarea class="gbox" rows="4" style="resize:vertical;min-height:110px" value=${text} onInput=${(e) => setText(e.target.value)} placeholder=${rec ? 'Listening… talk now' : 'The week view should also show…'}></textarea>
    <div class="btns"><button class=${'pill ' + (rec ? 'danger' : 'sun')} onClick=${talk}>${rec ? '⏹ Stop' : '🎙 Talk instead'}</button><button class="pill" disabled=${!text.trim()} onClick=${send}>Send</button></div>
    ${b.feedbackPublic ? html`<p style="font-size:12px;color:var(--ink2);font-weight:800;margin-top:10px">🌐 Ideas go on a public list so we can keep track of them. Names from your board are taken out first, but please leave out anything private.</p>` : ''}
    <p style="font-size:12px;color:var(--muted);font-weight:700;margin-top:10px">Tip: on the tablet say "Hey calendar, feedback" to open this with the mic already on.</p>`}</div></div>`;
}
// ---------- ambient and sleep ----------
// Seven days from today, compact, for the screensaver.
function WeekStrip({ b, overlay }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(b.today, i)); const wx = (d) => b.weather?.days.find((x) => x.date === d); const meal = (d) => b.meals.find((m) => m.date === d);
  const evOn = (d) => b.events.filter((e) => e.date <= d && e.endDate >= d).sort((a, c) => (a.allDay === c.allDay ? a.start.localeCompare(c.start) : a.allDay ? -1 : 1));
  return html`<div class=${'weekstrip' + (overlay ? ' overlay' : '')}>${days.map((d, i) => { const x = wx(d); const ev = evOn(d); const m = meal(d); const dt = fromYmd(d); return html`<div class=${'ws' + (i === 0 ? ' today' : '') + (dt.getDay() === 0 || dt.getDay() === 6 ? ' wkend' : '')}>
    <div class="wsh"><b>${i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DAYN[dt.getDay()].slice(0, 3) + ' ' + dt.getDate()}</b>${x ? html`<span>${x.icon} ${x.high}°/${x.low}°</span>` : ''}</div>
    ${ev.slice(0, 3).map((e) => html`<div class="wse" style=${{ borderLeftColor: e.color }}>${e.allDay ? '' : html`<i>${e.timeLabel}</i> `}${e.emoji} ${e.title}</div>`)}
    ${ev.length > 3 ? html`<div class="wsm">+${ev.length - 3} more</div>` : ''}${!ev.length ? html`<div class="wsm">Free day 🎈</div>` : ''}
    ${m ? html`<div class="wsd">${m.emoji || '🍽️'} ${m.text}</div>` : ''}</div>`; })}</div>`;
}
// The idle screen's "at a glance" card: what's left of today grouped by morning, afternoon and evening,
// with anything in the next 90 minutes marked "soon". Late in the day it adds tomorrow.
const PARTS = [['morning', 'This morning', 0, 12], ['afternoon', 'This afternoon', 12, 17], ['evening', 'This evening', 17, 24]];
function Glance({ b, now }) {
  const hr = (d) => d.getHours() + d.getMinutes() / 60; const nowH = hr(now);
  const onDay = (d) => b.events.filter((e) => e.date <= d && e.endDate >= d);
  const today = onDay(b.today); const allDay = today.filter((e) => e.allDay);
  const timed = today.filter((e) => !e.allDay && e.date === b.today && new Date(e.end) > now).sort((a, c) => a.start.localeCompare(c.start));
  const meal = b.meals.find((m) => m.date === b.today);
  const groups = PARTS.filter(([, , , to]) => to > nowH).map(([k, label, from, to]) => {
    const evs = timed.filter((e) => { const h = Math.max(hr(new Date(e.start)), nowH); return h >= from && h < to; }); // a thing already going counts in the part of the day we're in now
    return { k, label: nowH >= from ? label.replace('This ', 'Rest of this ') : label, evs, dinner: k === 'evening' && meal };
  });
  const late = nowH >= 18; const tm = addDays(b.today, 1);
  const tmr = late ? onDay(tm).sort((a, c) => (a.allDay === c.allDay ? a.start.localeCompare(c.start) : a.allDay ? -1 : 1)) : [];
  const row = (e) => { const s = new Date(e.start), en = new Date(e.end); const live = s <= now && now < en; const mins = (s - now) / 60000; const soon = !live && mins > 0 && mins <= 90;
    return html`<div class=${'gl-e' + (live ? ' live' : soon ? ' soon' : '')}><i style=${{ background: e.color }}></i><b>${live ? 'Now' : e.timeLabel}</b><span>${e.emoji} ${e.title}<small>${e.who}${e.place && !live ? ' · leave by ' + e.place.leaveBy : ''}${soon ? html` · <em>in ${Math.max(1, Math.round(mins))} min</em>` : ''}</small></span></div>`; };
  const shown = groups.filter((g) => g.evs.length || g.dinner);
  return html`<div class="card next glance"><div class="lbl">Today at a glance</div>
    ${allDay.length ? html`<div class="gl-all">${allDay.map((e) => html`<span style=${{ borderColor: e.color }}>${e.emoji} ${e.title}</span>`)}</div>` : ''}
    ${shown.map((g) => html`<div class="gl-g"><div class="gl-h">${g.label}<span>${g.evs.length ? `${g.evs.length} thing${g.evs.length === 1 ? '' : 's'}` : ''}</span></div>${g.evs.slice(0, 4).map(row)}${g.evs.length > 4 ? html`<div class="gl-more">+${g.evs.length - 4} more</div>` : ''}${g.dinner ? html`<div class="gl-e din"><i></i><b>🍽️</b><span>Dinner: ${meal.emoji || ''} ${meal.text}</span></div>` : ''}</div>`)}
    ${!shown.length ? html`<div class="gl-free">${late ? 'Nothing else tonight 🌙' : 'Nothing else on the calendar today 🎈'}</div>` : ''}
    ${late ? html`<div class="gl-g"><div class="gl-h">Tomorrow, ${DAYN[fromYmd(tm).getDay()]}<span>${tmr.length ? `${tmr.length} thing${tmr.length === 1 ? '' : 's'}` : 'nothing yet'}</span></div>${tmr.slice(0, 4).map((e) => html`<div class="gl-e"><i style=${{ background: e.color }}></i><b>${e.allDay ? 'all day' : e.timeLabel}</b><span>${e.emoji} ${e.title}<small>${e.who}${e.place ? ' · leave by ' + e.place.leaveBy : ''}</small></span></div>`)}${tmr.length > 4 ? html`<div class="gl-more">+${tmr.length - 4} more</div>` : ''}</div>` : ''}
  </div>`;
}
function Ambient({ b, onWake }) {
  const [t, setT] = useState(new Date()); useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i); }, []);
  const photos = b.photoIds || []; const secs = Math.max(5, b.config.photos?.seconds || 20); const [pi, setPi] = useState(() => Math.floor(Math.random() * Math.max(1, photos.length)));
  useEffect(() => { if (photos.length < 2) return; const i = setInterval(() => setPi((x) => (x + 1) % photos.length), secs * 1000); return () => clearInterval(i); }, [photos.length, secs]);
  useEffect(() => { if (photos.length > 1) { const img = new Image(); img.src = `/api/photo/${photos[(pi + 1) % photos.length]}`; } }, [pi, photos.length]);
  const w = b.weather; const d0 = w?.days.find((x) => x.date === b.today); const hrs = w ? w.hourly.filter((x) => x.date === b.today && +x.hour.slice(0, 2) >= t.getHours()).slice(0, 7) : [];
  const nextCard = html`<${Glance} b=${b} now=${t} />`;
  const showWeek = b.config.ambient?.showWeek !== false;
  const stands = b.kids.map((k) => html`<div class="card stand"><${Avatar} kid=${k} size="64px" /><div class="nm">${k.name}<small>Level ${k.level.level} · 🔥 ${k.streak} days · ${money(k.week.total)} so far</small></div><${Ring} size=${56} pct=${k.today.length ? k.today.filter((x) => x.done).length / k.today.length : 0} color=${k.color} text=${`${k.today.filter((x) => x.done).length}/${k.today.length}`} /></div>`);
  if (photos.length) return html`<div class=${'ambient photos' + (showWeek ? ' withweek' : '')} onClick=${onWake}>
    <div class="photo">${photos.map((id, i) => html`<img key=${id} src=${i === pi || i === (pi + 1) % photos.length ? `/api/photo/${id}` : ''} class=${i === pi ? 'on' : ''} alt="" />`)}</div>
    <div class="right"><div><div class="clock" style="font-size:96px">${fmtClock(t)}</div><div class="date" style="font-size:22px">${longDate(b.today)}</div></div>
      ${w ? html`<div class="card next" style="display:flex;align-items:center;gap:14px"><span style="font-size:48px">${w.current.icon}</span><div class="t" style="margin:0">${w.current.temp}° · ${d0?.high}°/${d0?.low}°<small>feels like ${w.current.feels}° · rain ${d0?.rainPct}%${b.tip ? ' · ' + b.tip : ''}</small></div></div>` : ''}
      <${NoteCards} b=${b} max=${2} />${nextCard}${stands}<div class="mascot-row" style="margin-top:0"><div class="mascot" style="width:64px;height:64px" dangerouslySetInnerHTML=${{ __html: MASCOT }}></div><${MascotBubble} b=${b} now=${t} style="margin-bottom:6px;font-size:13px" /></div></div>${showWeek ? html`<${WeekStrip} b=${b} />` : ''}</div>`;
  return html`<div class=${'ambient' + (showWeek ? ' withweek' : '')} onClick=${onWake}><div><div class="clock">${fmtClock(t)}</div><div class="date">${longDate(b.today)}</div>
    ${w ? html`<div class="wxamb"><span class="ico">${w.current.icon}</span><div class="t">${w.current.temp}°<small>feels like ${w.current.feels}°, ${w.current.label.toLowerCase()}</small></div><div class="facts2"><span>High <b>${d0?.high}°</b></span><span>Low <b>${d0?.low}°</b></span><span>Rain <b>${d0?.rainPct}%</b></span><span>Wind <b>${w.current.wind} ${b.config.weather.units === 'celsius' ? 'km/h' : 'mph'}</b></span><span>Sunrise <b>${d0?.sunrise}</b></span><span>Sunset <b>${d0?.sunset}</b></span>${b.tip ? html`<span style="color:#8a4b00">${b.tip}</span>` : ''}</div><div class="hourly">${hrs.map((x) => html`<div>${x.hour}<span>${x.icon}</span><b>${x.temp}°</b></div>`)}</div></div>` : ''}
    <div class="mascot-row" style="margin-top:30px"><div class="mascot" dangerouslySetInnerHTML=${{ __html: MASCOT }}></div><${MascotBubble} b=${b} now=${t} /></div></div>
    <div class="right"><${NoteCards} b=${b} max=${2} />${nextCard}${stands}</div>${showWeek ? html`<${WeekStrip} b=${b} />` : ''}</div>`;
}
// Night: a nearly black screen with a dim clock that drifts slowly so nothing burns in. A web page can't lower the real brightness, so it goes dark instead.
function Sleep({ onWake }) {
  const [t, setT] = useState(new Date()); useEffect(() => { const i = setInterval(() => setT(new Date()), 10000); return () => clearInterval(i); }, []);
  const m = t.getHours() * 60 + t.getMinutes(); const x = 20 + ((m * 7) % 60), y = 25 + ((m * 13) % 50);
  return html`<div class="sleep" onClick=${onWake}><div class="nightclock" style=${{ left: x + '%', top: y + '%' }}>${fmtClock(t)}<small>🌙 tap to wake</small></div></div>`;
}
const gmKey = 'fb-gm-done';
const gmDone = () => { try { return localStorage.getItem(gmKey); } catch { return null; } };
// Morning: a full good-morning screen from wake time until someone taps "Let's go".
function GoodMorning({ b, onDone, openKid }) {
  const [t, setT] = useState(new Date()); useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i); }, []);
  const w = b.weather; const d0 = w?.days.find((x) => x.date === b.today); const meal = b.meals.find((m) => m.date === b.today);
  const evs = b.events.filter((e) => e.date <= b.today && e.endDate >= b.today).sort((a, c) => (a.allDay === c.allDay ? a.start.localeCompare(c.start) : a.allDay ? -1 : 1));
  const done = () => { try { localStorage.setItem(gmKey, b.today); } catch {} onDone(); };
  return html`<div class="gm">
    <div class="gmtop"><div><h1>Good morning! ☀️</h1><div class="gmdate">${longDate(b.today)} · ${b.isSchoolDay ? 'school day' : 'no school today'}</div></div><div class="clock">${fmtClock(t)}</div></div>
    <${NoteCards} b=${b} />
    <div class="gmgrid" style=${{ '--gmk': b.kids.length }}>
      <div class="card gmwx">${w ? html`<span class="ico">${w.current.icon}</span><div><b>${w.current.temp}° now</b> · high ${d0?.high}°, low ${d0?.low}°<small>${d0 ? `rain ${d0.rainPct}%` : ''}${b.tip ? ' · ' + b.tip : ''}</small></div>` : html`<div>Weather is loading…</div>`}</div>
      ${b.kids.map((k) => { const ms = k.today.filter((x) => x.when === 'morning' && !x.doneByOther); const list = ms.length ? ms : k.today.filter((x) => !x.doneByOther).slice(0, 4); return html`<button class="card gmkid" style=${{ '--kc': k.color }} onClick=${() => { done(); openKid(k.id); }}>
        <div class="gmk"><${Avatar} kid=${k} size="72px" /><div><b>${k.name}</b>${b.isSchoolDay && k.leaveTime ? html`<small>out the door by ${k.leaveTime}</small>` : html`<small>${list.length} thing${list.length === 1 ? '' : 's'} today</small>`}</div></div>
        <ul>${list.slice(0, 5).map((x) => html`<li class=${x.done ? 'ok' : ''}><span>${x.done ? '✅' : x.emoji}</span>${x.title}</li>`)}${!list.length ? html`<li><span>🎈</span>Nothing to do yet</li>` : ''}</ul></button>`; })}
      <div class="card gmday"><div class="lbl">Today</div>${evs.length ? evs.slice(0, 6).map((e) => html`<div class="gme" style=${{ borderLeftColor: e.color }}><i>${e.allDay ? 'all day' : e.timeLabel}</i>${e.emoji} ${e.title}<small>${e.who}${e.place ? ' · leave by ' + e.place.leaveBy : ''}</small></div>`) : html`<div class="gme">Nothing on the calendar 🎈</div>`}${evs.length > 6 ? html`<div class="gme more">+${evs.length - 6} more</div>` : ''}
        <div class="gme din">🍽️ Dinner: ${meal ? `${meal.emoji || ''} ${meal.text}` : 'not planned yet'}</div></div>
    </div>
    <div class="gmbottom"><div class="mascot-row" style="margin:0"><div class="mascot" dangerouslySetInnerHTML=${{ __html: MASCOT }}></div><div class="bubble">${woof(b)}Good morning, ${andList(b.kids.map((k) => k.name))}! ${b.config.family.dog ? '🐾' : '☀️'}</div></div>
      <button class="pill sun gmgo" onClick=${done}>Let's go! ☀️</button></div>
  </div>`;
}
function inWindow(from, to, now) { const cur = now.getHours() * 60 + now.getMinutes(); const [fh, fm] = from.split(':').map(Number), [th, tm] = to.split(':').map(Number); const f = fh * 60 + fm, t = th * 60 + tm; return f < t ? cur >= f && cur < t : cur >= f || cur < t; }

// ---------- timer ----------
function Timer({ t, onDone, onCancel }) {
  const [left, setLeft] = useState(t.seconds); useEffect(() => { const end = Date.now() + t.seconds * 1000; const i = setInterval(() => { const l = Math.max(0, Math.round((end - Date.now()) / 1000)); setLeft(l); if (l === 0) { clearInterval(i); chime('win'); speak(`${t.label} timer is done!`); onDone(); } }, 500); return () => clearInterval(i); }, [t]);
  return html`<div class="timerbox"><span>⏱ ${t.label}</span><b>${pad(Math.floor(left / 60))}:${pad(left % 60)}</b><button class="pill lite sm" onClick=${onCancel}>✕</button></div>`;
}

// ---------- grown-ups' phones ----------
// Turns on notifications on this phone so the kitchen screen (and the board's alerts) can reach it.
export async function enablePush(who) {
  if (!('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)) throw new Error('This browser cannot get notifications');
  const perm = await Notification.requestPermission(); if (perm !== 'granted') throw new Error('Notifications are blocked. Allow them in your phone settings, then try again.');
  const reg = await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; const { publicKey } = await api('/api/push/key');
  const pad2 = '='.repeat((4 - (publicKey.length % 4)) % 4); const key = Uint8Array.from(atob((publicKey + pad2).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await api('/api/push/subscribe', { sub: sub.toJSON(), who }); try { localStorage.setItem('fb-who', who); } catch {}
}
// 'checking' | 'on' | 'off' | 'unsupported' for this phone's notifications
function usePushState() {
  const [st, setSt] = useState('checking');
  useEffect(() => { (async () => { try { if (!('serviceWorker' in navigator) || !('PushManager' in window)) return setSt('unsupported'); const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription(); if (!sub) return setSt('off'); const info = await api('/api/push/status', { endpoint: sub.endpoint }).catch(() => null); setSt(info ? 'on' : 'off'); } catch { setSt('off'); } })(); }, []);
  return [st, setSt];
}
const startHidden = () => { try { return localStorage.getItem('fb-start-hidden') === '1'; } catch { return false; } };
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || !!navigator.standalone;
// Opens the "Get the app" steps from anywhere on the board (the App below listens for it).
export const openApp = () => dispatchEvent(new Event('fb-get-app'));
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// The first-week checklist for grown-ups. One "next up" step at a time, suited to the device they're holding; each step ticks itself off once it's done.
const onComputer = () => !isIOS() && !/Android/i.test(navigator.userAgent) && matchMedia('(pointer:fine)').matches && innerWidth >= 900;
function PairBox() {
  const [code, setCode] = useState(''); const [msg, setMsg] = useState(''); const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); setMsg(''); try { const r = await fetch('/link', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code }) }); if (r.ok) { setOk(true); chime('win'); confetti(); } else { const t = await r.text(); setMsg((/<p class="e">([^<]+)/.exec(t) || [])[1]?.replace(/&#39;/g, '’') || 'That code didn’t match. Check the tablet.'); chime('bad'); } } catch { setMsg('Could not reach the board. Try again.'); } finally { setBusy(false); } };
  if (ok) return html`<p class="gsok">🎉 The tablet is joining your board now!</p>`;
  return html`<div class="pairbox"><input class="gbox" value=${code} maxlength="9" placeholder="ABC 123" autocapitalize="characters" onInput=${(e) => setCode(e.target.value.toUpperCase())} onKeyDown=${(e) => e.key === 'Enter' && go()} /><button class="pill" disabled=${busy || code.replace(/\W/g, '').length < 6} onClick=${go}>Add tablet</button>${msg ? html`<p class="pterr">${msg}</p>` : ''}</div>`;
}
function PhoneQR() {
  const [svg, setSvg] = useState('');
  useEffect(() => { import('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm').then((m) => { const q = (m.default || m)(0, 'M'); q.addData(location.origin); q.make(); setSvg(q.createSvgTag({ cellSize: 4, margin: 2 })); }).catch(() => {}); }, []);
  return svg ? html`<div class="qr" dangerouslySetInnerHTML=${{ __html: svg }}></div>` : html`<b class="qrurl">${location.host}</b>`;
}
function GettingStarted({ b, openParents, planDinner, onHide, openKids }) {
  const st = b.start; const [push, setPush] = usePushState(); const [msg, setMsg] = useState(''); const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('fb-start-hidden') === '1'; } catch { return false; } }); const [all, setAll] = useState(false); const [pick, setPick] = useState(null);
  if (!st || hidden) return null;
  const others = b.config.family.parents.filter((p) => p.id !== b.me?.personId).map((p) => p.name); const home = isStandalone(); const ios = isIOS(); const pc = onComputer();
  const host = location.host; const kidsLeft = b.kids.filter((k) => (b.config.setup?.kidsTurn || []).includes(k.id)).map((k) => k.name);
  const steps = [
    { done: st.display, e: '📺', t: 'Put the board on your kitchen tablet', how: html`On the tablet, open <b>${host}</b> and tap <b>“Setting up the kitchen screen? Get a pairing code”</b>. Type the code it shows here:`, act: html`<${PairBox} />` },
    { done: !st.kidsTurn, e: '🎨', t: `Kids make their avatars`, how: `${andList(kidsLeft) || 'The kids'} still need${kidsLeft.length === 1 ? 's' : ''} a turn. It takes each kid about a minute.`, act: html`<button class="pill sm" onClick=${openKids}>Start the kids’ turn</button>` },
    { done: st.calendar, e: '📅', t: 'Connect your calendar', how: 'Then everyone’s plans show up on the board, each in their own color.', act: html`<button class="pill sm" onClick=${() => openParents('calendar')}>Connect it</button>` },
    ...(pc ? [{ done: st.pushes > 0, e: '📱', t: 'Get the board on your phone', how: 'Point your phone’s camera here, sign in, and it’ll walk you through the rest.', act: html`<${PhoneQR} />` }] : [
      { done: home, e: '📲', t: 'Get the app on your phone', how: 'It opens full screen like any other app, and stays signed in.', act: html`<button class="pill sm" onClick=${openApp}>Get the app</button>` },
      { done: push === 'on', e: '🔔', t: 'Get notes from the kitchen', how: ios && !home ? 'Get the app first, then open it from its icon.' : 'The grocery list, notes from the kids, stars to approve and pay day.', act: ios && !home ? null : html`<button class="pill sm" onClick=${async () => { setMsg(''); try { await enablePush(b.me?.name || ''); setPush('on'); chime('win'); } catch (e) { setMsg(e.message); } }}>Turn on</button>` }]),
    ...(st.grownups > 1 ? [{ done: st.accounts >= st.grownups, e: '💌', t: `Invite ${andList(others)}`, how: 'So everyone can approve stars, plan dinners and get the grocery list.', act: html`<button class="pill sm" onClick=${() => openParents('account')}>Invite</button>` }] : []),
    { done: st.checked, e: '✅', t: 'Kids tick off their first chore', how: 'On the kitchen screen, they tap their name, then a chore. Cue the confetti.' },
    { done: st.meal, e: '🍝', t: 'Plan tonight’s dinner', how: 'It shows on the kitchen screen, so nobody has to ask.', act: html`<button class="pill sm" onClick=${planDinner}>Plan it</button>` },
  ];
  const n = steps.filter((x) => x.done).length; if (n === steps.length) return null;
  const hide = () => { try { localStorage.setItem('fb-start-hidden', '1'); } catch {} setHidden(true); onHide && onHide(); };
  const nx = steps.find((x) => x.t === pick && !x.done) || steps.find((x) => !x.done); const rest = steps.filter((x) => x !== nx);
  return html`<div class="card ptcard gs"><div class="pth">🚀 Getting started <span>${n} of ${steps.length} done</span><button class="gshide" onClick=${hide}>Hide</button></div>
    <div class="ptbar"><i style=${{ width: Math.round((100 * n) / steps.length) + '%', background: 'var(--leaf)' }}></i></div>
    <div class="gsnext"><small>Next up</small><div class="gsnt"><span>${nx.e}</span><b>${nx.t}</b></div><p>${nx.how}</p>${nx.act || ''}</div>
    <button class="gsall" onClick=${() => setAll(!all)}>${all ? 'Hide the other steps' : `See all ${steps.length} steps`}</button>
    ${all ? rest.map((x) => html`<button class=${'gsrow' + (x.done ? ' done' : '')} disabled=${x.done} onClick=${() => setPick(x.t)}><span class="gsck">${x.done ? '✓' : x.e}</span><div class="gst"><b>${x.t}</b></div>${x.done ? '' : html`<span class="gsgo">›</span>`}</button>`) : ''}
    ${msg ? html`<p class="pterr">${msg}</p>` : ''}</div>`;
}
function PushCard({ b }) {
  const [st, setSt] = usePushState(); const [msg, setMsg] = useState('');
  const ios = isIOS(); const standalone = isStandalone();
  if (st === 'on' || st === 'checking') return null;
  const who = b.me?.name || b.config.family.parents[0]?.name || '';
  return html`<div class="card ptcard ptpush"><div class="pth">🔔 Get things from the kitchen</div>
    ${ios && !standalone ? html`<p>On an iPhone, notifications come through the app. Get the app, then open it from its icon.</p><button class="pill" onClick=${openApp}>Get the app</button>`
      : st === 'unsupported' ? html`<p>This browser can't get notifications. Get the app instead, then open it from its icon.</p><button class="pill" onClick=${openApp}>Get the app</button>`
      : html`<p>The kitchen screen can send you the grocery list or a note, and you'll hear when a quest needs approving.</p><button class="pill" onClick=${async () => { setMsg(''); try { await enablePush(who); setSt('on'); chime('win'); toast('Notifications on'); } catch (e) { setMsg(e.message); } }}>Turn on notifications</button>${msg ? html`<p class="pterr">${msg}</p>` : ''}`}</div>`;
}
// The grown-ups' home screen on their phones: what needs them, how the kids are doing, groceries, and today.
function ParentToday({ b, refresh, setPage, openEv, withPin, openParents, openKids }) {
  const [, setHidTick] = useState(0);
  const now = new Date(); const [add, setAdd] = useState(''); const [sharing, setSharing] = useState(false); const [quick, setQuick] = useState(null); const [mealDay, setMealDay] = useState(null);
  const kn = (id) => b.kids.find((k) => k.id === id); const claims = b.claims.filter((c) => c.status === 'pending'); const rq = (b.rewardRequests || []).filter((r) => r.status === 'pending');
  const cash = b.kids.flatMap((k) => (k.bank?.requests || []).filter((r) => r.status === 'pending'));
  const decide = (path, id, ok) => withPin(async (pin) => { try { await api(path, { id, approve: ok }, pin); chime(ok ? 'win' : 'bad'); refresh(); } catch (e) { toast(e.message); } });
  const open = b.groceries.filter((g) => !g.done); const addG = async () => { if (!add.trim()) return; await api('/api/grocery', { text: add, by: b.me?.name || 'phone' }); setAdd(''); chime('ok'); refresh(); };
  const tomorrow = addDays(b.today, 1); const evs = (d) => b.events.filter((e) => e.date <= d && e.endDate >= d).sort((a, c) => (a.allDay === c.allDay ? a.start.localeCompare(c.start) : a.allDay ? -1 : 1));
  const meal = (d) => b.meals.find((m) => m.date === d);
  const evRow = (e) => { const past = !e.allDay && new Date(e.end) < now; return html`<button class=${'ptev' + (past ? ' past' : '')} onClick=${() => openEv(e)}><i style=${{ background: e.color }}></i><b>${e.allDay ? 'all day' : e.timeLabel}</b><span>${e.emoji} ${e.title}${e.place && !past ? html`<small>leave by ${e.place.leaveBy}</small>` : ''}</span></button>`; };
  return html`<div class="page ptoday">
    <${GettingStarted} b=${b} openParents=${openParents} openKids=${openKids} planDinner=${() => setMealDay(b.today)} onHide=${() => setHidTick((n) => n + 1)} />
    ${b.start && !startHidden() ? '' : html`<${PushCard} b=${b} />`}
    ${claims.length || rq.length || cash.length ? html`<div class="card ptcard ptneeds"><div class="pth">✋ Needs you</div>
      ${cash.map((r) => html`<div class="ptrow"><b style=${{ color: kn(r.kid)?.color }}>${kn(r.kid)?.name}</b><span>💵 ${money(r.amount)} cash from the bank <small>${money(kn(r.kid)?.bank.balance || 0)} saved</small></span><button class="pill sm" onClick=${() => decide('/api/bank/decide', r.id, true)}>Handed over</button><button class="pill sm ghost" onClick=${() => decide('/api/bank/decide', r.id, false)}>Not now</button></div>`)}
      ${claims.map((c) => html`<div class="ptrow"><b style=${{ color: kn(c.kid)?.color }}>${kn(c.kid)?.name}</b><span>${c.title} <small>★ ${c.stars}</small></span><button class="pill sm" onClick=${() => decide('/api/quest/decide', c.id, true)}>Yes</button><button class="pill sm ghost" onClick=${() => decide('/api/quest/decide', c.id, false)}>No</button></div>`)}
      ${rq.map((r) => html`<div class="ptrow"><b style=${{ color: kn(r.kid)?.color }}>${kn(r.kid)?.name}</b><span>${r.emoji} ${r.title} <small>★ ${r.cost}</small></span><button class="pill sm" onClick=${() => decide('/api/reward/decide', r.id, true)}>Yes</button><button class="pill sm ghost" onClick=${() => decide('/api/reward/decide', r.id, false)}>Not now</button></div>`)}</div>` : ''}
    ${b.notes.length ? html`<div class="card ptcard"><div class="pth">📌 On the kitchen screen <span>${b.notes.length}</span></div>
      ${b.notes.map((n) => html`<div class="ptrow"><span>${n.text} <small>${n.from_who ? 'from ' + n.from_who + ' · ' : ''}${ago(n.created_at)}</small></span><button class="pill sm ghost" onClick=${async () => { await del('/api/note/' + n.id); chime('ok'); refresh(); }}>Remove</button></div>`)}
      <button class="ptmore" onClick=${() => setQuick('note')}>+ Post another note</button></div>` : ''}
    <div class="card ptcard"><div class="pth">⭐ ${andList(b.kids.map((k) => k.name))} today</div>
      ${b.kids.map((k) => { const mine = k.today.filter((t) => !t.doneByOther); const done = mine.filter((t) => t.done).length; const left = mine.filter((t) => !t.done); const m = minsUntil(k.leaveTime, now);
        return html`<button class="ptkid" onClick=${() => setPage(k.id)}><${Avatar} kid=${k} size="48px" /><div class="ptk"><div><b>${k.name}</b> <span class="ptc">${done}/${mine.length}</span>${b.isSchoolDay && m > 0 && m < 240 ? html`<em>out the door in ${m} min</em>` : ''}</div>
          <div class="ptbar"><i style=${{ width: (mine.length ? Math.round(100 * done / mine.length) : 0) + '%', background: k.color }}></i></div>
          <small>${left.length ? 'Left: ' + left.slice(0, 3).map((t) => t.title).join(', ') + (left.length > 3 ? ` +${left.length - 3}` : '') : mine.length ? 'All done today 🎉' : 'Nothing on the list today'}${k.weeklyAllowance > 0 ? ` · ${money(k.week.total)} by pay day ${payLabel(b)}` : ''}</small></div></button>`; })}</div>
    ${b.kids.some((k) => k.quiz?.on && k.quiz.week.length) ? html`<div class="card ptcard"><div class="pth">🧠 Brain quests this week</div>
      ${b.kids.filter((k) => k.quiz?.on).map((k) => { const w = k.quiz.week; const right = w.reduce((s, r) => s + r.score, 0), tot = w.reduce((s, r) => s + r.total, 0); const missed = [...new Set(w.flatMap((r) => r.missed))];
        return html`<div class="ptrow"><b style=${{ color: k.color }}>${k.name}</b><span>${w.length ? `${w.length} of ${k.quiz.perWeek} done · ${right}/${tot} right · ★ ${w.reduce((s, r) => s + r.stars, 0)}` : 'none yet'}${missed.length ? html`<small class="ptsub">Practice: ${missed.slice(0, 4).join(', ').toLowerCase()}</small>` : ''}</span></div>`; })}</div>` : ''}
    <div class="card ptcard"><div class="pth">🛒 Groceries <span>${open.length}</span>${open.length ? html`<button class="pill sm wa" onClick=${() => setSharing(true)}>📤 Send</button>` : ''}</div>
      <div class="ptadd"><input class="gbox" value=${add} placeholder="Add milk, eggs…" onInput=${(e) => setAdd(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && addG()} /><button class="pill" onClick=${addG}>Add</button></div>
      <div class="ptgroc">${open.slice(0, 8).map((g) => html`<button onClick=${async () => { await api(`/api/grocery/${g.id}/toggle`, {}); refresh(); }}><span class="bx"></span>${g.text}</button>`)}</div>
      ${open.length > 8 ? html`<button class="ptmore" onClick=${() => setPage('groceries')}>See all ${open.length} →</button>` : !open.length ? html`<small class="ptempty">The list is empty.</small>` : ''}</div>
    <div class="card ptcard"><div class="pth">📅 Today</div>${evs(b.today).length ? evs(b.today).map(evRow) : html`<small class="ptempty">Nothing on the calendar.</small>`}
      <button class="ptev din" onClick=${() => setMealDay(b.today)}><i></i><b>🍽️</b><span>${meal(b.today) ? `Dinner: ${meal(b.today).text}` : 'Plan tonight’s dinner'}</span></button>
      <div class="pth sub">Tomorrow</div>${evs(tomorrow).length ? evs(tomorrow).slice(0, 5).map(evRow) : html`<small class="ptempty">Nothing yet.</small>`}
      <button class="ptmore" onClick=${() => setPage('week')}>The whole week →</button></div>
    <div class="card ptcard"><div class="pth">⚡ Quick</div><div class="ptquick">
      <button onClick=${() => setQuick('todo')}>📌 To-do for a kid</button><button onClick=${() => setQuick('note')}>💬 Note on the kitchen screen</button><button onClick=${() => setMealDay(tomorrow)}>🍽️ Plan tomorrow’s dinner</button></div></div>
    ${sharing ? html`<${ShareSheet} items=${open} onClose=${() => setSharing(false)} />` : ''}
    ${quick ? html`<${QuickSheet} b=${b} kind=${quick} refresh=${refresh} onClose=${() => setQuick(null)} />` : ''}
    ${mealDay ? html`<${MealSheet} date=${mealDay} meal=${meal(mealDay)} onClose=${() => setMealDay(null)} refresh=${refresh} />` : ''}
  </div>`;
}
function QuickSheet({ b, kind, refresh, onClose }) {
  const [t, setT] = useState(''); const [kid, setKid] = useState('both'); const [when, setWhen] = useState(b.today);
  const go = async () => { if (!t.trim()) return; try { if (kind === 'todo') await api('/api/todo', { title: t.trim(), kid: kid === 'both' ? null : kid, date: when }); else await api('/api/note', { text: t.trim(), from: b.me?.name || '', days: 3 }); chime('ok'); toast(kind === 'todo' ? 'Added to the list' : 'Posted on the kitchen screen'); refresh(); onClose(); } catch (e) { toast(e.message); } };
  return html`<div class="ov" onClick=${onClose}><div class="sheet" style="width:min(460px,100%)" onClick=${(e) => e.stopPropagation()}><button class="close" onClick=${onClose}>×</button>
    <h3>${kind === 'todo' ? '📌 To-do for a kid' : '💬 Note on the kitchen screen'}</h3>
    <input class="gbox" autofocus value=${t} placeholder=${kind === 'todo' ? 'Return library books' : 'Pizza night! 🍕'} onInput=${(e) => setT(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && go()} />
    ${kind === 'todo' ? html`<div class="chips big">${[...b.kids.map((k) => [k.id, k.name]), ['both', b.kids.length > 2 ? 'Everyone' : 'Both']].map(([id, n]) => html`<button class=${kid === id ? 'on' : ''} onClick=${() => setKid(id)}>${n}</button>`)}</div>
      <div class="chips big"><button class=${when === b.today ? 'on' : ''} onClick=${() => setWhen(b.today)}>Today</button><button class=${when === addDays(b.today, 1) ? 'on' : ''} onClick=${() => setWhen(addDays(b.today, 1))}>Tomorrow</button></div>` : ''}
    <div class="btns"><button class="pill" disabled=${!t.trim()} onClick=${go}>${kind === 'todo' ? 'Add' : 'Post'}</button></div></div></div>`;
}
// Kitchen screen → grown-ups' phones.
function SendSheet({ b, onClose }) {
  const [to, setTo] = useState('all'); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const open = b.groceries.filter((g) => !g.done).length;
  const send = async (what) => { setBusy(true); try { const r = await api('/api/push/send', { what, to, text: note, from: '' }); chime('win'); toast(`Sent to ${r.sent} phone${r.sent === 1 ? '' : 's'} 📲`); onClose(); } catch (e) { chime('bad'); toast(e.message); } finally { setBusy(false); } };
  return html`<div class="ov" onClick=${onClose}><div class="sheet sendsheet" onClick=${(e) => e.stopPropagation()}><button class="close" onClick=${onClose}>×</button>
    <h3>📲 Send to phones</h3>
    <div class="chips big">${[['all', 'Everyone'], ...b.config.family.parents.map((p) => [p.name, p.name])].map(([v, l]) => html`<button class=${to === v ? 'on' : ''} onClick=${() => setTo(v)}>${l}</button>`)}</div>
    <div class="shbtns"><button class="shb wa" disabled=${busy || !open} onClick=${() => send('groceries')}><span>🛒</span>Grocery list${open ? ` (${open})` : ''}</button><button class="shb" disabled=${busy} onClick=${() => send('today')}><span>📅</span>Today’s plan</button></div>
    <div class="ptadd" style="margin-top:12px"><input class="gbox" value=${note} placeholder="Or type a quick note…" onInput=${(e) => setNote(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && note.trim() && send('note')} /><button class="pill" disabled=${busy || !note.trim()} onClick=${() => send('note')}>Send</button></div>
  </div></div>`;
}

// ---------- first-run setup ----------
// Loads the setup wizard only when it's needed, so everyday use stays light.
function SetupGate({ b, pinApi, refresh }) {
  const [mod, setMod] = useState(null); const [pin, setPin] = useState(null);
  useEffect(() => { import('./setup.js').then(setMod); }, []);
  const [asked, setAsked] = useState(false);
  const ask = () => { setAsked(false); pinApi.withPin(async (p) => { setPin(p || ''); return true; }).then((r) => { if (!r) setAsked(true); }); };
  useEffect(() => { if (!b.auth?.enabled) setPin(''); else ask(); }, []);
  if (asked && pin === null) return html`<div class="wiz"><div class="wizcard"><h2>A grown-up is updating the board 🛠️</h2><p class="wizp">Setup is being run again. A grown-up can enter the PIN to continue.</p><div class="wiznav"><span></span><button class="pill" onClick=${ask}>Enter PIN</button></div></div>${pinApi.ui}</div>`;
  if (!mod || pin === null) return html`<div class="wiz"><div class="wizcard"><h2>Getting setup ready…</h2></div>${pinApi.ui}</div>`;
  return html`<${mod.Setup} b=${b} pin=${pin} onDone=${() => refresh()} />`;
}
function KidsGate(props) {
  const [mod, setMod] = useState(null); useEffect(() => { import('./kids.js').then(setMod); }, []);
  return mod ? html`<${mod.KidsSetup} ...${props} />` : html`<div class="wiz"><div class="wizcard"><h2>One sec…</h2></div></div>`;
}
// ---------- app ----------
const PAGES = ['week', 'home', 'wardrobe', 'groceries'];
// Light or dark colors. "Follow the sun" uses today's sunrise and sunset for the family's town (7:00 and 19:00 if no town is set).
export function isDarkNow(b, now = new Date()) {
  const mode = b?.config?.theme?.mode || 'sun'; if (mode === 'dark') return true; if (mode !== 'sun') return false;
  const d0 = b.weather?.days?.find((x) => x.date === b.today); const mins = (s, dflt) => { const m = /^(\d\d):(\d\d)/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : dflt; };
  const n = now.getHours() * 60 + now.getMinutes(); return n < mins(d0?.sunrise, 420) || n >= mins(d0?.sunset, 1140) + 15; // a little after sunset, while there's still some light
}
function useTheme(b, clock) {
  const dark = !!b && isDarkNow(b, clock);
  useEffect(() => { try { localStorage.setItem('fb-dark', dark ? '1' : ''); } catch {} document.documentElement.classList.toggle('dark', dark); document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#121a24' : '#1f3a5f'); }, [dark]);
}
function App() {
  const [b, setB] = useState(null); const [err, setErr] = useState(''); const [page, setPageState] = useState('home'); const [wardKid, setWardKid] = useState(null);
  const [ev, setEv] = useState(null); const [wx, setWx] = useState(false); const [fb, setFb] = useState(false); const [parents, setParents] = useState(false); const [ambient, setAmbient] = useState(false); const [timer, setTimer] = useState(null); const [clock, setClock] = useState(new Date()); const [gmClosed, setGmClosed] = useState(false); const [preview, setPreview] = useState(null); const [kidsOpen, setKidsOpen] = useState(() => { try { const x = sessionStorage.getItem('fb-kids-now') === '1'; sessionStorage.removeItem('fb-kids-now'); return x; } catch { return false; } }); const [kidsLater, setKidsLater] = useState(false);
  useEffect(() => { const m = () => { setParents(false); setPreview('morning'); }; const n = () => { setParents(false); setPreview('night'); }; addEventListener('fb-preview-morning', m); addEventListener('fb-preview-night', n); return () => { removeEventListener('fb-preview-morning', m); removeEventListener('fb-preview-night', n); }; }, []);
  const pagesRef = useRef(); const idleRef = useRef(Date.now()); const timerCb = useRef(null); const pinApi = usePin();
  useTheme(b, clock);
  pinApi.setParent(b?.me?.kind === 'parent');
  const bootVersion = useRef(null); const [update, setUpdate] = useState(false);
  // "Get the app": a gentle offer the first time, and the steps whenever someone asks for them.
  const [appOpen, setAppOpen] = useState(reopenGuide); const [nudge, setNudge] = useState(nudgeWanted);
  useEffect(() => { const o = () => { setNudge(false); setAppOpen(true); }; addEventListener('fb-get-app', o); return () => removeEventListener('fb-get-app', o); }, []);
  const refresh = refreshBoard = useCallback(async () => { try { const j = await api('/api/board'); setMascot(j.config.family); if (!bootVersion.current) bootVersion.current = j.version; else if (j.version && j.version !== bootVersion.current) setUpdate(true); setB(j); setErr(''); } catch (e) { setErr(e.message); } }, []);
  useEffect(() => { const back = () => { if (document.visibilityState === 'visible') refresh(); }; document.addEventListener('visibilitychange', back); return () => document.removeEventListener('visibilitychange', back); }, [refresh]);
  useEffect(() => { refresh(); const i = setInterval(refresh, 60000); const c = setInterval(() => setClock(new Date()), 1000); return () => { clearInterval(i); clearInterval(c); }; }, []);
  useEffect(() => { const bump = () => { if (ambient && Date.now() - idleRef.current < 400) return; idleRef.current = Date.now(); if (ambient) setAmbient(false); }; ['pointerdown', 'keydown', 'touchstart'].forEach((e) => addEventListener(e, bump, { passive: true })); const i = setInterval(() => { if (b && b.me?.kind !== 'parent' && !(b.auth?.local && localStorage.getItem('fb-view') === 'parent') && !parents && !timer && !document.querySelector('.sheet.quiz') && !document.querySelector('.payday') && Date.now() - idleRef.current > (b.config.ambient.idleMinutes || 2) * 60000) setAmbient(true); }, 5000); return () => { ['pointerdown', 'keydown', 'touchstart'].forEach((e) => removeEventListener(e, bump)); clearInterval(i); }; }, [b, parents, ambient, timer]);
  useEffect(() => { if (!b) return; const k = PAGES.map((p) => b.kids.find((x) => x.id === p) ? p : p); }, [b]);
  // Grown-ups' phones get their own home page and order; the kitchen screen keeps the kids' layout.
  const parentView = !!b && (b.me?.kind === 'parent' || (b.auth?.local && (() => { try { return localStorage.getItem('fb-view') === 'parent'; } catch { return false; } })()));
  const pageList = useMemo(() => b ? (parentView ? ['today', 'groceries', 'week', ...b.kids.map((k) => k.id), 'wardrobe'] : ['week', 'home', ...b.kids.map((k) => k.id), 'wardrobe', 'groceries']) : PAGES, [b, parentView]);
  const homePage = parentView ? 'today' : 'home'; const [send, setSend] = useState(false);
  // Pay day screen: opens by itself on the kitchen screen when a kid with pay to collect opens their page.
  // Later closes it until the kid next comes to their page; the Collect button on their page opens it again.
  const [payOpen, setPayOpen] = useState(null); const [payShut, setPayShut] = useState({});
  const openPay = (k) => { if (k?.payday) setPayOpen({ id: k.id, due: k.payday, bal: k.bank.balance }); };
  useEffect(() => { setPayShut((s) => (s[page] ? { [page]: s[page] } : {})); }, [page]);
  useEffect(() => { if (!b || payOpen || parents || parentView) return; const k = b.kids.find((x) => x.id === page); if (k?.payday && payShut[k.id] !== k.payday.week) openPay(k); }, [b, page, parents, payOpen, payShut]);
  // Pages are located by where each one actually sits, so the tab bar always matches the page on screen.
  const pageEl = (i) => pagesRef.current?.children[i]; const goingTo = useRef(null);
  const setPage = (p, kid) => { if (kid) setWardKid(kid); setPageState(p); const i = pageList.indexOf(p); const el = pagesRef.current; const t = pageEl(i); if (el && t) { goingTo.current = p; clearTimeout(goingTo.t); goingTo.t = setTimeout(() => { goingTo.current = null; }, 1500); el.scrollTo({ left: t.offsetLeft, behavior: 'smooth' }); } };
  const onScroll = () => { const el = pagesRef.current; if (!el) return; let best = 0, gap = Infinity; [...el.children].forEach((c, i) => { const d = Math.abs(c.offsetLeft - el.scrollLeft); if (d < gap) { gap = d; best = i; } });
    const p = pageList[best]; if (goingTo.current) { if (p === goingTo.current && gap < 2) goingTo.current = null; return; } if (p && p !== page) setPageState(p); };
  // A resized window keeps showing the same page.
  useEffect(() => { const fix = () => { const el = pagesRef.current; const t = pageEl(pageList.indexOf(page)); if (el && t) { el.style.scrollBehavior = 'auto'; el.scrollLeft = t.offsetLeft; el.style.scrollBehavior = ''; } }; addEventListener('resize', fix); return () => removeEventListener('resize', fix); }, [page, pageList]);
  useEffect(() => { const el = pagesRef.current; const t = pageEl(pageList.indexOf(page)); if (el && t) el.scrollTo({ left: t.offsetLeft }); }, [b && pageList.length]);
  // First load on a grown-up's phone opens their page; links like /#groceries (from notifications) open that page.
  const firstRef = useRef(true);
  useEffect(() => { if (!b) return; const fromHash = () => { const h = decodeURIComponent(location.hash.slice(1)); if (h && pageList.includes(h)) { setTimeout(() => setPage(h), 30); return true; } return false; };
    if (firstRef.current) { firstRef.current = false; if (!fromHash() && parentView && page === 'home') setTimeout(() => setPage('today'), 30); }
    const on = () => fromHash(); addEventListener('hashchange', on); return () => removeEventListener('hashchange', on); }, [b && pageList.join()]);
  const startTimer = (seconds, label, cb) => { timerCb.current = cb; setTimer({ seconds, label }); };
  const voice = useVoice({ b, refresh, withPin: pinApi.withPin, onAction: (a) => { if (a.type === 'timer') startTimer(a.seconds, a.label || 'Timer', null); if (a.type === 'navigate') setPage(a.page === 'day' || a.page === 'month' ? 'week' : a.page); if (a.type === 'weather') setWx(true); if (a.type === 'feedback') setFb(true); } });
  useEffect(() => { if (update && (ambient || Date.now() - idleRef.current > 5 * 60000)) location.reload(); }, [update, ambient]);
  if (err && !b) return html`<div class="boot">Could not load the board: ${err}. <button class="pill" onClick=${refresh}>Retry</button></div>`;
  if (!b) return html`<div class="boot">Loading the board…</div>`;
  if (b.config.setup?.done === false) return html`<${SetupGate} b=${b} pinApi=${pinApi} refresh=${refresh} />`;
  const now = clock; const amb = b.config.ambient; const display = !parentView;
  // The kids' turn to make their avatars: on the kitchen screen until they're done (or tap Later), or when a grown-up starts it.
  if ((b.config.setup?.kidsTurn || []).length && (kidsOpen || (display && !kidsLater))) return html`<${KidsGate} b=${b} refresh=${refresh} onClose=${() => { setKidsOpen(false); setKidsLater(true); }} />`;
  // Night: on the kitchen display, the dark screen comes on after a quiet minute during night hours.
  const night = display && amb.dimAtNight && inWindow(amb.sleepFrom, amb.sleepTo, now); const asleep = night && Date.now() - idleRef.current > 60000 && !document.querySelector('.sheet.quiz');
  // Morning: from wake time until noon, on chosen days, until someone taps "Let's go".
  const wakeMin = toMin(amb.sleepTo || '06:00'); const nowMin = now.getHours() * 60 + now.getMinutes();
  const morning = display && amb.morning !== false && (amb.morningDays || [0, 1, 2, 3, 4, 5, 6]).includes(now.getDay()) && nowMin >= wakeMin && nowMin < 720 && gmDone() !== b.today && !gmClosed;
  const leaveLine = b.isSchoolDay ? b.kids.map((k) => { const m = minsUntil(k.leaveTime, now); return m > 0 && m < 240 ? `${k.name} leaves in ${m} min` : null; }).filter(Boolean).join(' · ') : '';
  return html`
    <div class="top"><div class="left"><button class="iconbtn" title="Home" onClick=${() => setPage(homePage)}>🏠</button><button class="d" onClick=${() => setPage(homePage)}>${longDate(b.today)}<small>${b.isSchoolDay ? 'School day' : 'No school'}${leaveLine ? ' · ' + leaveLine : ''}${b.meals.find((m) => m.date === b.today) ? ' · dinner: ' + b.meals.find((m) => m.date === b.today).text : ''}</small></button></div>
      <button class="clock" onClick=${() => setPage(homePage)}>${fmtClock(now)}</button>
      <div class="right"><${WxPill} b=${b} onClick=${() => setWx(true)} />${display ? html`<button class="iconbtn" title="Send to phones" onClick=${() => setSend(true)}>📲<i>Send</i></button>` : ''}<button class="iconbtn" title="Ideas and feedback" onClick=${() => setFb(true)}>💬<i>Ideas</i></button>${display ? html`<button class="iconbtn" title="Screensaver" onClick=${(e) => { e.stopPropagation(); setTimeout(() => { idleRef.current = Date.now(); setAmbient(true); }, 50); }}>🌙<i>Sleep</i></button>` : ''}<button class="iconbtn" title="Grown-ups" onClick=${() => setParents(true)}>⚙️<i>Grown-ups</i></button></div></div>
    ${update ? html`<div class="updatebar"><span>✨ A new version of the board is ready.</span><button class="pill sm" onClick=${() => location.reload()}>Refresh now</button><button class="pill sm lite" onClick=${() => setUpdate(false)}>Later</button></div>` : ''}
    ${b.stage ? html`<div class="banner stage">🧪 Test copy (${b.stage}). Nothing here touches real families.</div>` : ''}
    ${nudge && !appOpen && !parents && !(parentView && b.start && !startHidden()) ? html`<${AppNudge} onOpen=${() => { setNudge(false); setAppOpen(true); }} onClose=${() => setNudge(false)} />` : ''}
    ${appOpen ? html`<${AppSheet} name=${b.appName} onClose=${() => setAppOpen(false)} />` : ''}
    <div class="pages" ref=${pagesRef} onScroll=${onScroll}>
      ${pageList.map((p) => { const k = b.kids.find((x) => x.id === p);
        if (k) return html`<${KidPage} key=${k.id} b=${b} k=${k} refresh=${refresh} setPage=${setPage} startTimer=${startTimer} withPin=${pinApi.withPin} openPay=${() => openPay(k)} />`;
        return { today: html`<${ParentToday} key="today" b=${b} refresh=${refresh} setPage=${setPage} openEv=${setEv} withPin=${pinApi.withPin} openParents=${(sec) => setParents(sec || true)} openKids=${() => setKidsOpen(true)} />`, week: html`<${Week} key="week" b=${b} openEv=${setEv} refresh=${refresh} withPin=${pinApi.withPin} />`, home: html`<${Home} key="home" b=${b} openEv=${setEv} setPage=${setPage} />`,
          wardrobe: html`<${Wardrobe} key="wardrobe" b=${b} kidId=${wardKid} refresh=${refresh} setPage=${setPage} />`, groceries: html`<${Groceries} key="groceries" b=${b} refresh=${refresh} />` }[p]; })}
    </div>
    <div class="dots">${pageList.map((p) => html`<button class=${p === page ? 'on' : ''} onClick=${() => setPage(p)} title=${p}></button>`)}</div>
    <div class="navbar">${pageList.filter((p) => !(parentView && p === 'wardrobe')).map((p) => { const k = b.kids.find((x) => x.id === p); const ic = { week: '📅', home: '🏠', today: '🏠', wardrobe: '👕', groceries: '🛒' }[p] || '⭐'; return html`<button class=${p === page ? 'on' : ''} onClick=${() => setPage(p)}>${k ? html`<${Avatar} kid=${k} size="24px" />` : html`<span>${ic}</span>`}${k ? k.name : p[0].toUpperCase() + p.slice(1)}</button>`; })}${parentView ? html`<button onClick=${() => setParents(true)}><span>⚙️</span>Settings</button>` : ''}</div>
    ${send ? html`<${SendSheet} b=${b} onClose=${() => setSend(false)} />` : ''}
    ${voice.ui}
    ${timer ? html`<${Timer} t=${timer} onDone=${() => { setTimer(null); if (timerCb.current) timerCb.current(); }} onCancel=${() => setTimer(null)} />` : ''}
    ${ev ? html`<${EventSheet} ev=${ev} b=${b} onClose=${() => setEv(null)} />` : ''}
    ${wx ? html`<${WxPanel} b=${{ ...b, setUnits: async (u) => { await api('/api/units', { units: u }); refresh(); } }} onClose=${() => setWx(false)} />` : ''}
    ${fb ? html`<${FeedbackSheet} b=${b} page=${page} onClose=${() => setFb(false)} />` : ''}
    ${parents ? html`<${Parents} b=${b} refresh=${refresh} pinApi=${pinApi} start=${typeof parents === 'string' ? parents : null} onClose=${() => setParents(false)} />` : ''}
    ${pinApi.ui}
    ${payOpen && !parents && b.kids.find((x) => x.id === payOpen.id) ? html`<${PayDay} key=${payOpen.id + payOpen.due.week} b=${b} k=${b.kids.find((x) => x.id === payOpen.id)} due=${payOpen.due} bal=${payOpen.bal} refresh=${refresh}
      onClose=${() => { setPayShut({ ...payShut, [payOpen.id]: payOpen.due.week }); setPayOpen(null); }} />` : ''}
    ${preview === 'night' ? html`<${Sleep} onWake=${() => setPreview(null)} />` : preview === 'morning' ? html`<${GoodMorning} b=${b} onDone=${() => setPreview(null)} openKid=${(id) => { setPreview(null); setTimeout(() => setPage(id), 50); }} />` : parents ? '' : asleep ? html`<${Sleep} onWake=${() => { idleRef.current = Date.now(); setAmbient(false); }} />` : morning ? html`<${GoodMorning} b=${b} onDone=${() => { idleRef.current = Date.now(); setAmbient(false); setGmClosed(true); }} openKid=${(id) => setTimeout(() => setPage(id), 50)} />` : ambient ? html`<${Ambient} b=${b} onWake=${() => setAmbient(false)} />` : ''}
  `;
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
// The app opened from its icon with its one-time sign-in code: the code has done its job, so tidy the address.
if (inApp() && new URLSearchParams(location.search).has('app')) history.replaceState(null, '', '/' + location.hash);
render(html`<${App} />`, document.getElementById('app'));
