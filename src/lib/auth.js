// Accounts, sessions and rate limits. Passwords: PBKDF2-SHA256 with a per-user salt; the round count is
// stored per user so it can be raised later. Session and invite tokens are random; only their SHA-256 is stored.
const enc = new TextEncoder();
export const ITER = 60000; // fits Cloudflare's free-plan CPU budget (about 5 ms); guessing is limited separately
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
export const randomHex = (n = 32) => hex(crypto.getRandomValues(new Uint8Array(n)));
export async function sha256hex(s) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
export async function hashPassword(pw, salt = randomHex(16), iter = ITER) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: iter }, key, 256);
  return { hash: hex(bits), salt, iter };
}
export function sameString(a, b) { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
export async function verifyPassword(pw, user) { if (!user?.pw_hash) return false; const h = await hashPassword(pw, user.pw_salt, user.pw_iter || ITER); return sameString(h.hash, user.pw_hash); }
export function passwordProblem(pw) { if (typeof pw !== 'string' || pw.length < 10) return 'Use at least 10 characters. A short sentence works well.'; if (/^(.)\1+$/.test(pw) || /^(0123456789|1234567890|password)/i.test(pw)) return 'That password is too easy to guess.'; return null; }
export const recoveryCode = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const r = crypto.getRandomValues(new Uint8Array(16)); let s = ''; for (let i = 0; i < 16; i++) { s += a[r[i] % a.length]; if (i % 4 === 3 && i < 15) s += '-'; } return s; };

// Rate limits: at most `max` failures per window for a key.
export async function check(env, key, max) { const now = Math.floor(Date.now() / 1000); const r = await env.DB.prepare('SELECT n, reset_at FROM ratelimit /* all-families: keys name their family when it matters */ WHERE key=?').bind(key).first(); if (r && r.reset_at > now && r.n >= max) return Math.max(1, Math.ceil((r.reset_at - now) / 60)); return 0; }
export async function fail(env, key, windowSec) { const now = Math.floor(Date.now() / 1000); await env.DB.prepare('INSERT INTO ratelimit /* all-families */ (key,n,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET n = CASE WHEN reset_at <= ? THEN 1 ELSE n + 1 END, reset_at = CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END').bind(key, now + windowSec, now, now).run(); }
export async function clearLimit(env, key) { await env.DB.prepare('DELETE FROM ratelimit /* all-families */ WHERE key=?').bind(key).run(); }

// Sessions
export const TTL = { parent: 120 * 86400, display: 400 * 86400 };
export const cookieOf = (req, name) => { const m = new RegExp('(?:^|;\\s*)' + name + '=([^;]+)').exec(req.headers.get('cookie') || ''); return m ? m[1] : null; };
export function sessionCookie(token, kind) { return `fbs=${token}; Path=/; Max-Age=${TTL[kind] || TTL.parent}; HttpOnly; SameSite=Lax; Secure`; }
export const clearCookie = () => 'fbs=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure';
export async function createSession(env, { userId, householdId, kind, label }) {
  const token = randomHex(32); const id = await sha256hex(token); const now = new Date(); const exp = new Date(now.getTime() + (TTL[kind] || TTL.parent) * 1000);
  await env.DB.prepare('INSERT INTO sessions(id,user_id,kind,label,created_at,last_seen,expires_at,household_id) VALUES(?,?,?,?,?,?,?,?)').bind(id, userId || null, kind, label || null, now.toISOString(), now.toISOString(), exp.toISOString(), householdId || env.HID || 1).run();
  return token;
}
export async function readSession(env, req) {
  const token = cookieOf(req, 'fbs'); if (!token || !/^[0-9a-f]{64}$/.test(token)) return null; const id = await sha256hex(token);
  const s = await env.DB.prepare('SELECT s.*, u.name AS user_name, u.email AS user_email, u.person_id FROM sessions s LEFT JOIN users u ON u.id = s.user_id AND u.household_id = s.household_id /* all-families: found by secret token */ WHERE s.id=?').bind(id).first();
  if (!s || s.expires_at < new Date().toISOString()) return null;
  if (Date.now() - Date.parse(s.last_seen) > 10 * 60 * 1000) { const exp = new Date(Date.now() + (TTL[s.kind] || TTL.parent) * 1000).toISOString(); await env.DB.prepare('UPDATE sessions SET last_seen=?, expires_at=? WHERE id=? /* all-families: by secret token */').bind(new Date().toISOString(), exp, id).run(); }
  return s;
}
export function deviceLabel(req) { const ua = req.headers.get('user-agent') || ''; const dev = /iPad/.test(ua) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Android phone' : 'Android tablet') : /Macintosh/.test(ua) ? 'Mac or iPad' : /Windows/.test(ua) ? 'Windows PC' : 'Device'; const br = /CriOS|Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : /Firefox/.test(ua) ? 'Firefox' : ''; return br ? `${dev}, ${br}` : dev; }

// Google sign-in (OpenID Connect, authorization code + PKCE). Client secret stays on the server.
export const googleOn = (env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export async function googleStart(env, origin, { display, ticket, signup }) {
  const state = randomHex(16), verifier = randomHex(32); const challenge = b64u(await crypto.subtle.digest('SHA-256', enc.encode(verifier)));
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  for (const [k, v] of Object.entries({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: origin + '/auth/google/callback', response_type: 'code', scope: 'openid email profile', state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' })) u.searchParams.set(k, v);
  const cookie = `fbo=${state}.${verifier}.${display ? 1 : 0}.${ticket || ''}.${signup || ''}; Path=/auth; Max-Age=600; HttpOnly; SameSite=Lax; Secure`;
  return { url: u.toString(), cookie };
}
export async function googleFinish(env, req, origin) {
  const q = new URL(req.url).searchParams; const [state, verifier, display, ticket, signup] = (cookieOf(req, 'fbo') || '').split('.');
  if (q.get('error')) return { error: q.get('error') === 'access_denied' ? 'Google sign-in was cancelled.' : 'Google said: ' + q.get('error') };
  if (!state || !sameString(state, q.get('state') || '')) return { error: 'That sign-in took too long or was opened in another browser. Please try again.' };
  const r = await fetch(env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: q.get('code') || '', client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: origin + '/auth/google/callback', grant_type: 'authorization_code', code_verifier: verifier }) });
  const j = await r.json().catch(() => ({})); if (!r.ok || !j.id_token) return { error: 'Google did not finish the sign-in (' + (j.error || r.status) + ').' };
  // The ID token came straight from Google's token endpoint over TLS, so its claims are checked rather than its signature (OIDC Core 3.1.3.7).
  let c; try { c = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(j.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')), (x) => x.charCodeAt(0)))); } catch { return { error: 'Google sent an unreadable answer.' }; }
  const issOk = c.iss === 'https://accounts.google.com' || c.iss === 'accounts.google.com';
  if (!issOk || c.aud !== env.GOOGLE_CLIENT_ID || !(c.exp * 1000 > Date.now()) || !c.email || c.email_verified === false || c.email_verified === 'false') return { error: 'Google could not confirm that email address.' };
  return { email: String(c.email).toLowerCase(), name: c.given_name || c.name || '', display: display === '1', ticket: ticket || '', signup: signup || '' };
}
export const clearGoogleCookie = () => 'fbo=; Path=/auth; Max-Age=0; HttpOnly; SameSite=Lax; Secure';

// Pages (served before the app loads, so plain HTML)
export const page = (title, inner, status = 200) => new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><link rel="icon" href="/icon.svg"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/manifest.webmanifest"><style>
*{box-sizing:border-box}body{font-family:Nunito,system-ui,-apple-system,sans-serif;background:linear-gradient(160deg,#eaf7ee,#d9f0e2 55%,#e6f4ff);margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;color:#1f2a44}
.card{background:#fff;border-radius:24px;padding:26px 28px;box-shadow:0 10px 30px rgba(31,90,60,.12);width:min(400px,100%)}h1{font-size:24px;color:#1f3a5f;margin:0 0 4px}p{color:#6b7280;font-size:14px;margin:0 0 14px;line-height:1.4}
label{display:block;font-weight:800;font-size:13px;margin:12px 0 4px;color:#3b4a66}input[type=email],input[type=password],input[type=text]{font-size:17px;width:100%;padding:11px 13px;border:2px solid #cfe5d6;border-radius:12px}input:focus{outline:none;border-color:#1f3a5f}
.chk{display:flex;gap:10px;align-items:flex-start;margin-top:14px;font-weight:700;font-size:14px;color:#3b4a66}.chk input{width:20px;height:20px;margin-top:1px}.chk small{display:block;color:#6b7280;font-weight:600}
button.g{background:#fff;color:#1f2a44;border:2px solid #cfe5d6;display:flex;align-items:center;justify-content:center;gap:10px}button{margin-top:16px;width:100%;padding:13px;border:0;border-radius:999px;background:#1f3a5f;color:#fff;font-weight:800;font-size:16px;cursor:pointer}.e{color:#b00020;font-weight:800;background:#ffe4e8;padding:8px 12px;border-radius:10px}.ok{color:#1f6a3b;font-weight:800;background:#dff1e5;padding:8px 12px;border-radius:10px}
details{margin-top:14px;font-size:14px;color:#3b4a66}.more{margin:18px 0 0;font-size:14px;line-height:1.9;text-align:center}.code{font-size:44px;font-weight:900;letter-spacing:.18em;text-align:center;color:#1f3a5f;background:#eaf7ee;border-radius:16px;padding:14px 0;margin:10px 0;font-family:ui-monospace,Menlo,monospace}summary{cursor:pointer;font-weight:800;color:#1f3a5f}a{color:#1f3a5f;font-weight:800}</style><div class="card">${inner}</div></html>`, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY' } });
export const escHtml = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function signInPage({ msg = '', ok = '', email = '', name = 'Family Board', google = false, signup = false } = {}) {
  const pw = `<form method="post" action="/auth/signin"><label for="e">Email</label><input id="e" name="email" type="email" autocomplete="username" required value="${escHtml(email)}"><label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password" required>
  <label class="chk"><input type="checkbox" name="display" value="1"><span>This is our family's kitchen display<small>Stays signed in for the kids. Parents still needs the PIN on this screen.</small></span></label><button>Sign in</button></form>
  <details><summary>Forgot your password?</summary><p style="margin-top:8px">Ask the other parent to reset it in Parents → Sign-in and devices, or use the recovery code you saved when sign-in was turned on.</p>
  <form method="post" action="/auth/recover"><label for="re">Email</label><input id="re" name="email" type="email" required><label for="rc">Recovery code</label><input id="rc" name="code" type="text" autocomplete="off" placeholder="ABCD-EFGH-JKLM-NPQR" required><label for="rp">New password</label><input id="rp" name="password" type="password" autocomplete="new-password" minlength="10" required><button>Reset password</button></form></details>`;
  const g = `<form method="get" action="/auth/google"><button class="g" type="submit"><svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Continue with Google</button>
  <label class="chk"><input type="checkbox" name="display" value="1"><span>This is our family's kitchen display<small>Stays signed in for the kids. Parents still needs the PIN on this screen.</small></span></label></form>
  <details><summary>Use a password instead</summary>${pw}</details>`;
  const more = `<p class="more"><a href="/auth/pair">Setting up the kitchen screen? Get a pairing code</a>${signup ? '<br><a href="/auth/signup">New here? Create your family\'s board</a>' : ''}<br><a href="/privacy" style="font-weight:600">Privacy</a></p>`;
  // Opened from the app's icon on the home screen: say so, so it doesn't look like something went wrong.
  const inApp = `<p class="ok" id="inapp" hidden>Welcome to the app! Sign in once on this device and it stays signed in.</p><script>if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) document.getElementById('inapp').hidden = false;</script>`;
  return page('Sign in', `<h1>${escHtml(name)}</h1>${inApp}<p>${google ? 'Sign in with your Google account. Each device stays signed in.' : 'Sign in with your parent account. Each device stays signed in.'}</p>${msg ? `<p class="e">${escHtml(msg)}</p>` : ''}${ok ? `<p class="ok">${escHtml(ok)}</p>` : ''}${google ? g : pw}${more}`, msg ? 401 : 200);
}
export function invitePage({ token, name, email, msg = '' }) {
  return page('Set your password', `<h1>Welcome, ${escHtml(name)}!</h1><p>Choose a password for <b>${escHtml(email)}</b>. You'll use it to sign in to the family board on your phone.</p>${msg ? `<p class="e">${escHtml(msg)}</p>` : ''}
  <form method="post" action="/auth/invite"><input type="hidden" name="t" value="${escHtml(token)}"><label for="p">New password</label><input id="p" name="password" type="password" autocomplete="new-password" minlength="10" required><label for="p2">Again</label><input id="p2" name="password2" type="password" autocomplete="new-password" minlength="10" required><button>Set password and sign in</button></form>`);
}
export const simplePage = (title, text) => page(title, `<h1>${escHtml(title)}</h1><p>${escHtml(text)}</p><a href="/">Go to sign in</a>`);
export const legacyCodePage = (msg = '', fresh = false) => page('Family Board', `<h1>${fresh ? 'Welcome! 👋' : 'Family Board'}</h1><p>${fresh ? 'Enter the setup code you chose when you deployed the board. Setup takes about ten minutes.' : 'Enter the family code once on this device.'}</p>${msg ? `<p class="e">${escHtml(msg)}</p>` : ''}<form method="post" action="/api/login"><input name="code" type="text" autocomplete="one-time-code" autocapitalize="off" autofocus style="font-size:24px;letter-spacing:.15em;text-align:center"><button>${fresh ? "Start setup" : "Open the board"}</button></form>`, 401);
