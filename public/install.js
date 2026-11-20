// "Get the app": puts the board on a phone, tablet or computer like any other app, with only the steps for the
// device in someone's hand. Families think of the board as an app, so these screens call it "the app".
import { h } from 'https://cdn.jsdelivr.net/npm/preact@11.2.0/+esm';
import { useState, useEffect } from 'https://cdn.jsdelivr.net/npm/preact@11.2.0/hooks/+esm';
import htm from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/+esm';
// app.js imports this file, so anything taken from app.js only exists once the board has finished loading.
// The pictures below are drawn while this file loads, so it has its own html instead of app.js's.
import { api, chime, confetti, toast } from './app.js';
import { deviceKind, isIOSKind, deviceWord, iosVersion, offerApp } from './device.js';
const html = htm.bind(h);

const who = () => ({ ua: navigator.userAgent, platform: navigator.platform, touchPoints: navigator.maxTouchPoints || 0 });
export const inApp = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || !!navigator.standalone;
const mem = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
// Opened from the icon: this device has the app. On Android and computers the app shares the browser's storage,
// so the browser remembers it too and stops offering it.
if (inApp()) mem.set('fb-app', 'installed');

// Android, Chrome and Edge offer their own one-tap install, once, early in the page's life. Keep it for our button.
let offer = null; const subs = new Set(); const tell = () => subs.forEach((f) => f());
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); offer = e; tell(); });
addEventListener('appinstalled', () => { offer = null; mem.set('fb-app', 'installed'); tell(); });
function useOffer() { const [, set] = useState(0); useEffect(() => { const f = () => set((n) => n + 1); subs.add(f); return () => subs.delete(f); }, []); return offer; }

// iPhones and iPads give an app from the home screen its own fresh storage, so it would open signed out.
// Before showing the steps, the page reloads with a one-time code in its address; the new app opens with that
// address once and signs itself in to the same family (see /api/app/handoff in the worker).
// A code lasts 20 minutes, so one made more than 15 minutes ago is swapped for a fresh one.
async function readyForIOS() {
  let at = 0; try { at = Number(sessionStorage.getItem('fb-app-at')) || 0; } catch {}
  if (new URLSearchParams(location.search).has('app') && Date.now() - at < 15 * 60000) return false;
  try { const { token } = await api('/api/app/handoff', {}); if (!token) return false; sessionStorage.setItem('fb-getapp', '1'); sessionStorage.setItem('fb-app-at', String(Date.now())); location.replace('/?app=' + token + location.hash); return true; } catch { return false; }
}
// After that reload the guide opens again by itself.
export const reopenGuide = () => { try { const on = sessionStorage.getItem('fb-getapp') === '1'; sessionStorage.removeItem('fb-getapp'); return on; } catch { return false; } };

// Pictures of the buttons people look for. Drawn here so they match the phone's own icons closely enough.
const svg = (inner) => html`<svg viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const G = {
  share: svg(html`<path d="M17 18h-5v24h24V18h-5"/><path d="M24 30V5"/><path d="M16 12l8-8 8 8"/>`),
  more: svg(html`<circle cx="11" cy="24" r="3.4" fill="currentColor" stroke="none"/><circle cx="24" cy="24" r="3.4" fill="currentColor" stroke="none"/><circle cx="37" cy="24" r="3.4" fill="currentColor" stroke="none"/>`),
  kebab: svg(html`<circle cx="24" cy="11" r="3.4" fill="currentColor" stroke="none"/><circle cx="24" cy="24" r="3.4" fill="currentColor" stroke="none"/><circle cx="24" cy="37" r="3.4" fill="currentColor" stroke="none"/>`),
  add: svg(html`<rect x="7" y="7" width="34" height="34" rx="8"/><path d="M24 16v16M16 24h16"/>`),
  install: svg(html`<rect x="5" y="8" width="38" height="26" rx="4"/><path d="M16 42h16M24 34v8"/><path d="M24 14v12M18 21l6 6 6-6"/>`),
  copy: svg(html`<rect x="15" y="15" width="26" height="26" rx="5"/><path d="M33 15V9a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v22a2 2 0 0 0 2 2h6"/>`),
  safari: svg(html`<circle cx="24" cy="24" r="18"/><path d="M31 17l-4 10-10 4 4-10z" fill="currentColor"/>`),
  app: html`<img src="/icon-192.png" width="44" height="44" alt="" style="border-radius:11px" />`,
  file: html`<b class="appword">File</b>`,
};
const Step = ({ n, g, t, s }) => html`<li class="appstep"><span class="appnum">${n}</span><span class="appglyph">${g}</span><span class="apptxt"><b>${t}</b>${s ? html`<small>${s}</small>` : ''}</span></li>`;
const Steps = ({ list }) => html`<ol class="appsteps">${list.map(([g, t, s], i) => html`<${Step} n=${i + 1} g=${g} t=${t} s=${s} />`)}</ol>`;

function stepsFor(kind, name, ver, tablet) {
  const done = [G.app, `Tap Add, then open ${name} from your home screen`, 'From now on, just tap the icon.'];
  if (kind === 'ios-safari') return ver >= 26 && !tablet ? [[G.more, 'Tap ••• next to the web address'], [G.share, 'Tap Share'], [G.add, 'Tap Add to Home Screen', 'Scroll down a little if you don’t see it.'], done]
    : [[G.share, 'Tap Share', tablet ? 'It’s at the top of the screen, or under •••' : ver ? 'It’s at the bottom of the screen.' : 'At the bottom of the screen, or under •••'], [G.add, 'Tap Add to Home Screen', 'Scroll down a little if you don’t see it.'], done];
  if (kind === 'ios-chrome') return [[G.share, 'Tap Share', 'It’s at the top, next to the web address.'], [G.add, 'Tap Add to Home Screen', 'Scroll down a little if you don’t see it.'], done];
  if (kind === 'android') return [[G.kebab, 'Tap ⋮ at the top right'], [G.add, 'Tap Install app', 'Some phones call it Add to Home screen.'], [G.app, 'Tap Install', `Then open ${name} from your home screen.`]];
  if (kind === 'mac-safari') return [[G.file, 'Click File at the top of the screen'], [G.add, 'Click Add to Dock'], [G.app, 'Click Add', `${name} is now in your Dock.`]];
  if (kind === 'desktop') return [[G.kebab, 'Click ⋮ at the top right'], [G.install, 'Click Install', 'It may be under “Cast, save and share”.'], [G.app, 'Click Install again', `${name} opens in its own window.`]];
  return [];
}

// The guide itself. Shows one big button where the browser can install in one tap, or a few picture steps.
export function AppGuide({ name = 'Family Board', onDone }) {
  const env = who(); const kind = deviceKind(env); const word = deviceWord(env); const ofr = useOffer();
  const ss = (k, v) => { try { return v === undefined ? sessionStorage.getItem(k) : v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { return null; } };
  // "Show the steps anyway" (someone deleted the app, or wants it again) survives the iPhone's reload.
  const [again, setAgain] = useState(() => ss('fb-app-again') === '1');
  const known = !again && mem.get('fb-app') === 'installed';
  const [busy, setBusy] = useState(isIOSKind(kind) && !inApp() && !known); const [won, setWon] = useState(false);
  useEffect(() => { if (!busy) return; readyForIOS().then((reloading) => { if (!reloading) setBusy(false); }); }, []);
  if (inApp()) return html`<div class="appg"><div class="appok">🎉 You’re using the app</div><p class="applead">You’re all set. Open ${name} from its icon any time.</p></div>`;
  if (!again && (won || mem.get('fb-app') === 'installed')) return html`<div class="appg"><div class="appok">🎉 You’ve got the app</div><p class="applead">Open ${name} from your ${word === 'computer' ? 'apps' : 'home screen'}. It opens full screen and stays signed in.</p>${onDone ? html`<button class="pill" onClick=${onDone}>OK</button>` : ''}<p class="appsmall"><button class="pill sm lite" onClick=${() => { ss('fb-app-again', '1'); setAgain(true); if (isIOSKind(kind)) { setBusy(true); readyForIOS().then((r) => { if (!r) setBusy(false); }); } }}>Show the steps anyway</button></p></div>`;
  if (busy) return html`<div class="appg"><p class="applead">Getting your app ready…</p></div>`;
  const install = async () => { try { offer.prompt(); const r = await offer.userChoice; if (r.outcome === 'accepted') { mem.set('fb-app', 'installed'); setWon(true); chime('win'); confetti(); } } catch {} };
  const lead = html`<p class="applead">Put ${name} on your ${word} like any other app. It opens full screen, and you stay signed in.</p>`;
  if (ofr && (kind === 'android' || kind === 'desktop')) return html`<div class="appg">${lead}<button class="pill appbig" onClick=${install}>${G.install} Install the app</button><p class="appsmall">Then tap Install when your ${word} asks.</p></div>`;
  if (kind === 'ios-other') {
    const copy = async () => { try { await navigator.clipboard.writeText(location.origin); toast('Link copied'); } catch { toast(location.host); } };
    return html`<div class="appg">${lead}<p class="applead"><b>First, open this page in Safari.</b> It’s open inside another app right now.</p>
      <${Steps} list=${[[G.copy, html`<button class="pill sm" onClick=${copy}>Copy the link</button>`], [G.safari, 'Open Safari and paste it in the address bar', 'Then tap Get the app again, in Safari.']]} /></div>`;
  }
  if (kind === 'none') return html`<div class="appg"><p class="applead">This browser can’t add apps. On your phone or tablet, open <b>${location.host}</b> and tap Get the app.</p></div>`;
  return html`<div class="appg">${lead}<${Steps} list=${stepsFor(kind, name, iosVersion(env.ua), word === 'tablet')} /></div>`;
}

export function AppSheet({ name, onClose }) {
  return html`<div class="ov" onClick=${onClose}><div class="sheet appsheet" onClick=${(e) => e.stopPropagation()}><button class="close" onClick=${onClose}>×</button><h3>📲 Get the app</h3><${AppGuide} name=${name} onDone=${onClose} /></div></div>`;
}

// A gentle first-time offer at the bottom of the board. "Not now" puts it away; Get the app stays in grown-up settings.
export const nudgeWanted = () => offerApp({ standalone: inApp(), kind: deviceKind(who()), noThanks: mem.get('fb-app-nudge') === 'no', installed: mem.get('fb-app') === 'installed' });
// Before the offer shows, ask whether this device already has the app in ways the browser's own storage can't tell:
// Chrome lists installed apps it knows about, and on iPhone and iPad the board knows whether the app this browser
// set up has opened. Either answer is remembered on this device.
export async function hasAppAlready() {
  let yes = false;
  try { if (navigator.getInstalledRelatedApps) yes = (await navigator.getInstalledRelatedApps()).length > 0; } catch {}
  if (!yes && isIOSKind(deviceKind(who()))) { try { yes = !!(await api('/api/app/status')).installed; } catch {} }
  if (yes) mem.set('fb-app', 'installed');
  return yes;
}
export function AppNudge({ onOpen, onClose }) {
  const word = deviceWord(who());
  const no = () => { mem.set('fb-app-nudge', 'no'); onClose(); };
  return html`<div class="appnudge"><img src="/icon-192.png" alt="" /><div><b>Get the app</b><small>Put the board on your ${word}, like any other app.</small></div><button class="pill sm" onClick=${onOpen}>Show me</button><button class="pill sm lite" onClick=${no}>Not now</button></div>`;
}
