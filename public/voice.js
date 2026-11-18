import { h } from 'https://cdn.jsdelivr.net/npm/preact@11.2.0/+esm';
import { useState, useEffect, useRef, useCallback } from 'https://cdn.jsdelivr.net/npm/preact@11.2.0/hooks/+esm';
import htm from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/+esm';
const html = htm.bind(h);
let cfgRef = { speak: true, voiceName: '', rate: 1, pitch: 1, quietFrom: '20:30', quietTo: '06:30', language: 'en-US', chime: true };
function quiet() { const now = new Date(); const cur = now.getHours() * 60 + now.getMinutes(); const [fh, fm] = cfgRef.quietFrom.split(':').map(Number), [th, tm] = cfgRef.quietTo.split(':').map(Number); const f = fh * 60 + fm, t = th * 60 + tm; return f < t ? cur >= f && cur < t : cur >= f || cur < t; }
// Rank voices: natural/neural first, then Google, then platform defaults; robotic eSpeak-style last.
export function rankVoices(lang = 'en') { const vs = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2))); const score = (v) => { const n = v.name.toLowerCase(); let s = 0; if (/natural|neural|premium|enhanced|online|wavenet|studio/.test(n)) s += 50; if (/google/.test(n)) s += 30; if (/samantha|ava|allison|zoe|karen|moira|tessa|aria|jenny|michelle|emma|libby|sonia/.test(n)) s += 25; if (/female|woman/.test(n)) s += 5; if (/espeak|compact|fred|albert|bad news|bells|boing|bubbles|cellos|deranged|hysterical|organ|trinoids|whisper|zarvox|junior|ralph|kathy|wobble|good news|jester|pipe organ|superstar|grandma|grandpa|rocko|shelley|eddy|flo|reed|sandy/.test(n)) s -= 40; if (v.localService) s += 3; if (v.lang === 'en-US') s += 4; return s; }; return vs.sort((a, b) => score(b) - score(a)); }
export function bestVoice() { const name = cfgRef.voiceName; const all = speechSynthesis.getVoices(); if (name) { const v = all.find((x) => x.name === name); if (v) return v; } return rankVoices(cfgRef.language || 'en')[0] || null; }
// iPad/iPhone Safari only allows audio and speech that start from a tap. primeSpeech() runs inside every tap on the mic.
const player = typeof Audio !== 'undefined' ? new Audio() : null; if (player) player.preload = 'auto';
function silentWav() { const n = 800, b = new ArrayBuffer(44 + n * 2), d = new DataView(b); const w = (o, s) => [...s].forEach((c, i) => d.setUint8(o + i, c.charCodeAt(0))); w(0, 'RIFF'); d.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true); d.setUint32(24, 8000, true); d.setUint32(28, 16000, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); w(36, 'data'); d.setUint32(40, n * 2, true); return URL.createObjectURL(new Blob([b], { type: 'audio/wav' })); }
let primed = false; export function primeSpeech() { if (primed) return; primed = true; try { if (player) { player.src = silentWav(); player.play().catch(() => {}); } if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch {} }
function deviceSpeak(text, vol) { if (!('speechSynthesis' in window)) return; try { if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); const v = bestVoice(); if (v) u.voice = v; u.rate = cfgRef.rate; u.pitch = cfgRef.pitch; u.lang = (v && v.lang) || cfgRef.language; u.volume = vol; setTimeout(() => { try { speechSynthesis.resume(); speechSynthesis.speak(u); } catch {} }, 60); } catch {} }
// Only one voice at a time: each new line stops whatever is still talking or loading, and a line
// that has been replaced never falls back to the device voice later.
let turn = 0, cloudId = 0;
function hush() { cloudId++; try { if (player) { player.onended = player.onerror = player.onplaying = null; player.pause(); } } catch {} try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch {} }
// Plays the natural cloud voice. It's made on demand, so a long sentence can take several seconds the first time.
// Resolves true once it has played, false if it never started (then the audio is stopped for good, so it
// can't start late on top of the device voice).
export function cloudSpeak(text, voice, vol = 1, maxWait = 15000) { return new Promise((resolve) => {
  if (!player) return resolve(false); let done = false, started = false; const me = ++cloudId;
  const fin = (ok) => { if (done) return; done = true; clearTimeout(t); if (!ok && !started && me === cloudId) { try { player.onplaying = null; player.pause(); player.removeAttribute('src'); player.load(); } catch {} } resolve(ok); };
  player.onplaying = () => { started = true; }; player.onended = () => fin(true); player.onerror = () => fin(started);
  player.volume = vol; player.src = ttsUrl(text, voice);
  player.play().catch(() => fin(false));
  const t = setTimeout(() => fin(started), maxWait); }); }
// What gets spoken: no emoji, and math signs said as words. Used for both speaking and warming up, so they match.
export const speakable = (t) => String(t || '').replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, '').replace(/×/g, ' times ').replace(/÷/g, ' divided by ').replace(/−/g, ' minus ').replace(/\s+/g, ' ').trim();
const ttsUrl = (text, voice) => `/api/tts?v=${encodeURIComponent(voice || cfgRef.cloudVoice || 'thalia')}&t=${encodeURIComponent(text)}`;
// Asks for lines ahead of time (one by one, in the background), so they play right away when needed.
let warmQ = Promise.resolve(); export function prewarm(texts) { if (cfgRef.cloud === false) return; for (const t of texts.map(speakable)) if (t) warmQ = warmQ.then(() => fetch(ttsUrl(t)).then((r) => r.arrayBuffer()).catch(() => {})); }
// direct: an answer to something someone just asked, so it always speaks (softer during quiet hours).
export function speak(text, { direct = false } = {}) { text = speakable(text); if (!text || !cfgRef.speak) return; const quietNow = quiet(); if (quietNow && !direct) return; const vol = quietNow ? 0.5 : (cfgRef.volume ?? 1); window.dispatchEvent(new Event('fb-speaking'));
  const mine = ++turn; hush();
  if (cfgRef.cloud !== false && player) { cloudSpeak(text, cfgRef.cloudVoice, vol).then((ok) => { if (!ok && mine === turn) deviceSpeak(text, vol); }); } else deviceSpeak(text, vol); }
// iPad and iPhone only let a page play sound after a tap. Unlock on the first tap anywhere, not just the mic.
if (typeof window !== 'undefined') { const unlock = () => { primed = false; primeSpeech(); }; window.addEventListener('pointerdown', unlock, { once: true, capture: true }); window.addEventListener('keydown', unlock, { once: true, capture: true }); }
let ac; const ding = (up = true) => { if (!cfgRef.chime) return; try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const o = ac.createOscillator(), g = ac.createGain(); o.connect(g); g.connect(ac.destination); const t = ac.currentTime; o.frequency.setValueAtTime(up ? 523 : 659, t); o.frequency.setValueAtTime(up ? 784 : 440, t + .1); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.15, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .3); o.start(t); o.stop(t + .32); } catch {} };

// One-shot dictation used by the feedback sheet: resolves with the transcript.
export function dictate({ onInterim } = {}) { return new Promise((resolve) => { const R = window.SpeechRecognition || window.webkitSpeechRecognition; if (!R) return resolve(null); const rec = new R(); rec.lang = cfgRef.language || 'en-US'; rec.interimResults = true; rec.continuous = true; let text = ''; rec.onresult = (e) => { let t = ''; for (const r of e.results) t += r[0].transcript; text = t; onInterim && onInterim(t); }; let done = false; const finish = () => { if (done) return; done = true; dictate.stop = null; resolve(text); }; rec.onerror = finish; rec.onend = finish; ding(true); rec.start();
  // Stop listening and make sure the mic is released: stop() first so the last words are kept, then abort() if the browser hangs on.
  dictate.stop = () => { try { rec.stop(); } catch {} ding(false); setTimeout(() => { if (!done) { try { rec.abort(); } catch {} finish(); } }, 1200); }; }); }
export function useVoice({ b, refresh, withPin, onAction }) {
  const [state, setState] = useState('idle'); const [heard, setHeard] = useState(''); const [reply, setReply] = useState(''); const recRef = useRef(null); const holdRef = useRef(false); const hideT = useRef();
  useEffect(() => { if (b) cfgRef = { ...cfgRef, ...b.config.voice }; }, [b]);
  const supported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  const send = useCallback(async (text, pin) => {
    setState('thinking'); setReply('');
    try {
      const r = await fetch('/api/voice', { method: 'POST', headers: { 'content-type': 'application/json', ...(pin ? { 'x-pin': pin } : {}) }, body: JSON.stringify({ text, speaker: 'voice' }) }); const j = await r.json();
      if (j.needPin && !pin) { const out = await withPin((p) => send(text, p)); if (!out) { setState('idle'); } return out; }
      setReply(j.say || (j.intent === 'navigate' ? 'Okay' : '…')); speak(j.say || (j.intent === 'navigate' ? 'Okay' : ''), { direct: true }); if (j.action) onAction(j.action); if (j.intent !== 'unknown') refresh(); setState('done');
      clearTimeout(hideT.current); hideT.current = setTimeout(() => { setState('idle'); setHeard(''); setReply(''); }, 4500); return j;
    } catch (e) { setReply('Sorry, something went wrong.'); setState('done'); setTimeout(() => setState('idle'), 4000); }
  }, [withPin, refresh, onAction]);
  const start = useCallback(() => {
    if (!supported) { setReply('This browser cannot listen. On the tablet use Chrome.'); setState('done'); setTimeout(() => setState('idle'), 3000); return; }
    const R = window.SpeechRecognition || window.webkitSpeechRecognition; const rec = new R(); rec.lang = cfgRef.language || 'en-US'; rec.interimResults = true; rec.continuous = false; recRef.current = rec; let finalText = '';
    rec.onresult = (e) => { let t = ''; for (const res of e.results) t += res[0].transcript; setHeard(t); if (e.results[e.results.length - 1].isFinal) finalText = t; };
    rec.onerror = (e) => { setState('idle'); if (e.error !== 'no-speech' && e.error !== 'aborted') { setReply('Mic problem: ' + e.error); setState('done'); setTimeout(() => setState('idle'), 3000); } };
    rec.onend = () => { const t = finalText || ''; if (t.trim()) send(t); else setState('idle'); };
    primeSpeech(); try { speechSynthesis.cancel(); } catch {} ding(true); setHeard(''); setReply(''); setState('listening'); rec.start();
  }, [send, supported]);
  const stop = useCallback(() => { try { recRef.current?.stop(); } catch {} ding(false); }, []);
  // Hands-free: a continuous recognizer that waits for the wake phrase. Needs no account; uses the browser's own speech service.
  const hfRef = useRef(null); const pausedRef = useRef(false);
  useEffect(() => {
    const on = !!b?.config.voice.handsFree; if (!on || !supported) return; let stopped = false; let backoff = 500;
    const wakes = [cfgRef.wake || 'hey calendar', ...String(b.config.voice.wakeAlso || '').split(',')].map((w) => w.trim().toLowerCase()).filter(Boolean);
    const stripWake = (t) => { t = t.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim(); for (const w of wakes) { const i = t.indexOf(w); if (i >= 0 && i < 12) return { hit: true, rest: t.slice(i + w.length).replace(/^[,.\s]+/, '').trim() }; } return { hit: false, rest: '' }; };
    const loop = () => {
      if (stopped) return; const R = window.SpeechRecognition || window.webkitSpeechRecognition; const rec = new R(); rec.lang = cfgRef.language || 'en-US'; rec.continuous = true; rec.interimResults = true; hfRef.current = rec; let handled = false;
      rec.onresult = (e) => { if (pausedRef.current || holdRef.current) return; const last = e.results[e.results.length - 1]; const txt = last[0].transcript; const { hit, rest } = stripWake(txt); if (!hit) return; if (!last.isFinal) { if (!handled) { handled = true; setState('listening'); setHeard('…'); } return; } handled = false; try { rec.abort(); } catch {} if (rest.length > 2) { setHeard(rest); send(rest); } else { ding(true); start(); } };
      rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { stopped = true; setReply('Microphone is blocked. Allow it in the browser settings for hands-free.'); setState('done'); setTimeout(() => setState('idle'), 5000); } };
      rec.onend = () => { if (stopped) return; setTimeout(loop, backoff); backoff = Math.min(backoff * 1.5, 8000); setTimeout(() => { backoff = 500; }, 30000); };
      try { rec.start(); } catch { setTimeout(loop, 2000); }
    };
    const pauseFor = (ms) => { pausedRef.current = true; setTimeout(() => { pausedRef.current = false; }, ms); };
    const onSpeak = () => pauseFor(4000); window.addEventListener('fb-speaking', onSpeak);
    loop();
    return () => { stopped = true; try { hfRef.current?.abort(); } catch {} window.removeEventListener('fb-speaking', onSpeak); };
  }, [b?.config.voice.handsFree, b?.config.voice.wake, b?.config.voice.wakeAlso, supported]);
  // while a one-shot command listen runs, keep the hands-free recognizer out of the way
  useEffect(() => { if (state === 'listening' || state === 'thinking') { pausedRef.current = true; } else { setTimeout(() => { pausedRef.current = false; }, 800); } }, [state]);
  const ui = html`
    ${state === 'listening' ? html`<div class="listen"></div>` : ''}
    ${state !== 'idle' ? html`<div class="vbox"><div class="heard">${state === 'listening' ? (heard ? '' : 'Listening… say it now') : state === 'thinking' ? 'Thinking… ' : ''}${heard}</div>${reply ? html`<div class="reply">${reply}</div>` : ''}</div>` : ''}
    <button class=${'mic' + (state === 'listening' ? ' on' : '')} aria-label=${state === 'listening' ? 'Stop listening' : 'Tap to talk'} onClick=${(e) => { e.preventDefault(); primeSpeech(); if (state === 'listening') stop(); else if (state !== 'thinking') { clearTimeout(hideT.current); start(); } }}>
      ${state === 'listening' ? html`<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2" fill="#fff"/></svg>` : html`<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3" fill="#fff"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg>`}</button>`;
  return { ui, state, send };
}
