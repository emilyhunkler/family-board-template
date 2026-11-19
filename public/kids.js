// The kids' turn: each kid makes their own avatar, one big choice at a time. Runs on the kitchen screen after setup,
// and any time later from a grown-up's Getting started list. Only free looks are offered; stars unlock the extras.
import { useState, useEffect } from 'https://cdn.jsdelivr.net/npm/preact@11.2.0/hooks/+esm';
import { html, api, toast, chime, confetti, Avatar, SKINS } from './app.js';

const HAIR = [...Array.from({ length: 19 }, (_, i) => 'short' + String(i + 1).padStart(2, '0')), ...Array.from({ length: 26 }, (_, i) => 'long' + String(i + 1).padStart(2, '0'))].filter((h) => !['long03', 'long08', 'long18'].includes(h)); // those three cost stars
const HAIR_COLORS = ['0e0e0e', '562306', '6a4e35', '796a45', '97804f', 'b9a05f', 'e5d7a3', 'ac6511', 'cb6820', 'ab2a18'];
const v = (n) => 'variant' + String(n).padStart(2, '0');
const EYES = [26, 1, 3, 5, 9, 12, 14, 16, 18, 20, 22, 24].map(v); const MOUTHS = [26, 1, 3, 5, 8, 10, 14, 17, 20, 22, 25, 30].map(v);
const PARTS = [
  { key: 'hair', q: 'Pick your hair', opts: HAIR, thumb: true },
  { key: 'hairColor', q: 'What color is it?', opts: HAIR_COLORS },
  { key: 'skinColor', q: 'Pick your skin', opts: SKINS },
  { key: 'eyes', q: 'Choose your eyes', opts: EYES, thumb: true },
  { key: 'mouth', q: 'Now your smile!', opts: MOUTHS, thumb: true },
];
const CHEERS = ['Ooh, nice!', 'Love it!', 'So cool!', 'Looking good!', 'Yes!', 'Great pick!'];

export function KidsSetup({ b, refresh, onClose }) {
  const waiting = b.config.setup?.kidsTurn || []; const [made, setMade] = useState({}); // id → their new look; the board refreshes when the kids close this
  const left = b.kids.filter((k) => waiting.includes(k.id) && !made[k.id]);
  const [kid, setKid] = useState(null);
  if (kid) return html`<${Maker} k=${kid} next=${left.find((x) => x.id !== kid.id)?.name} onDone=${(id, look) => { setMade({ ...made, [id]: look }); setKid(null); }} />`;
  if (!left.length) return html`<div class="wiz kidwiz"><div class="wizcard kidcard"><h2>Everybody’s here! 🎉</h2>
    <div class="kidline">${b.kids.map((k, i) => html`<div class="pop" style=${{ animationDelay: i * 0.1 + 's' }}><${Avatar} kid=${k} look=${made[k.id]} size="96px" /><b>${k.name}</b></div>`)}</div>
    <button class="pill sun big" onClick=${() => { refresh(); onClose(); }}>Let’s go!</button></div></div>`;
  return html`<div class="wiz kidwiz"><div class="wizcard kidcard"><h2>Kids, it’s your turn! 🎨</h2><p class="wizp">Tap your name to make your avatar.</p>
    <div class="kidpick">${b.kids.map((k) => { const done = !left.includes(k); return html`<button class=${done ? 'done' : ''} disabled=${done} style=${{ background: k.color }} onClick=${() => { chime('ok'); setKid(k); }}><span>${done ? '✓' : k.name[0]}</span>${k.name}</button>`; })}</div>
    <button class="pill ghost" onClick=${() => { refresh(); onClose(); }}>Later</button></div></div>`;
}

function Maker({ k, next, onDone }) {
  const [look, setLook] = useState(() => ({ ...(k.avatar || {}), ...(k.wardrobe?.look || {}) })); const [step, setStep] = useState(-1); const [cheer, setCheer] = useState(''); const [bounce, setBounce] = useState(0); const [saving, setSaving] = useState(false);
  const part = PARTS[step];
  const pick = (val) => { setLook({ ...look, [part.key]: val }); setBounce((n) => n + 1); setCheer(CHEERS[Math.random() * CHEERS.length | 0]); chime('ok'); };
  const finish = async () => { setSaving(true); try { await api('/api/wardrobe/look', { kid: k.id, look }); await api('/api/kids-done', { kid: k.id }); confetti(); chime('win'); setStep(PARTS.length); } catch (e) { toast(e.message || 'Could not save'); } finally { setSaving(false); } };
  useEffect(() => { if (step === PARTS.length) setTimeout(confetti, 600); }, [step]);
  const me = html`<div class="kidav" key=${bounce}><${Avatar} look=${look} size="100%" /></div>`;
  if (step === -1) return html`<div class="wiz kidwiz"><div class="wizcard kidcard"><h2>Hi ${k.name}! 👋</h2><p class="wizp big">Let’s make you!</p>${me}<button class="pill sun big" onClick=${() => { chime('ok'); setStep(0); }}>Start</button></div></div>`;
  if (step === PARTS.length) return html`<div class="wiz kidwiz"><div class="wizcard kidcard"><h2>Looking good, ${k.name}! ✨</h2>${me}<p class="wizp big">Earn stars by doing your chores to unlock pets, hats and backgrounds.</p><button class="pill sun big" onClick=${() => onDone(k.id, look)}>${next ? `Pass it to ${next}! 👉` : 'Done'}</button></div></div>`;
  return html`<div class="wiz kidwiz"><div class="wizcard kidcard">
    <div class="kiddots">${PARTS.map((_, i) => html`<i class=${i <= step ? 'on' : ''}></i>`)}</div>
    <div class="kidtop">${me}<div><h2>${part.q}</h2><p class="cheer" key=${bounce}>${cheer}</p></div></div>
    <div class=${'kidopts' + (part.thumb ? ' thumbs' : ' swatches')}>${part.opts.map((o) => html`<button class=${look[part.key] === o ? 'on' : ''} aria-label=${o} onClick=${() => pick(o)}>${part.thumb ? html`<${Avatar} look=${{ ...look, [part.key]: o }} size="100%" />` : html`<i style=${{ background: '#' + o }}></i>`}</button>`)}</div>
    <div class="wiznav"><button class="pill lite" onClick=${() => setStep(step - 1)}>‹ Back</button><button class="pill sun big" disabled=${saving} onClick=${() => (step === PARTS.length - 1 ? finish() : (chime('ok'), setStep(step + 1)))}>${step === PARTS.length - 1 ? (saving ? 'Saving…' : 'That’s me! ✨') : 'Next ›'}</button></div>
  </div></div>`;
}

