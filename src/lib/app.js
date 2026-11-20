// Get the app: the web app manifest, and the one-time code that signs a new iPhone or iPad app in to its family.
// iOS gives a home-screen app its own storage, separate from Safari, so without this it would open signed out.
import * as A from './auth.js';

export const HANDOFF_MINUTES = 20;
export const tokenOk = (t) => typeof t === 'string' && /^[0-9a-f]{64}$/.test(t);
// The phone itself, from the part of its user agent that Safari and the home-screen app share: "(iPhone; CPU iPhone OS 18_6 like Mac OS X)".
export const deviceOf = (req) => (/\(([^)]*)\)/.exec(req.headers.get('user-agent') || '') || [])[1] || '';

// One manifest for every family (browsers fetch it without cookies). With a code, the app opens with that code the first time.
export function manifest(env, app) {
  const name = String(env.SITE_NAME || 'Family Board').slice(0, 40); const start = tokenOk(app) ? '/?app=' + app : '/';
  return { id: '/', name, short_name: name.length <= 12 ? name : 'Board', description: 'Your family’s calendar, chores, stars and groceries.', start_url: start, scope: '/', display: 'standalone', display_override: ['standalone'], orientation: 'any', background_color: '#eaf7ee', theme_color: '#1f3a5f', lang: 'en',
    icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }, { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] };
}
export const manifestResponse = (env, app) => new Response(JSON.stringify(manifest(env, app)), { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'no-cache' } });

// Made by a signed-in device (or one past the old family code) just before it shows the iPhone steps.
export async function makeHandoff(env, req, session) {
  const now = new Date(); const token = A.randomHex(32);
  await env.DB.prepare('DELETE FROM app_handoffs /* all-families: tidy up */ WHERE expires_at < ? OR used_at IS NOT NULL').bind(now.toISOString()).run();
  await env.DB.prepare('INSERT INTO app_handoffs(id,household_id,user_id,kind,device,created_at,expires_at) VALUES(?,?,?,?,?,?,?)')
    .bind(await A.sha256hex(token), session?.household_id || env.HID || 1, session?.user_id || null, session ? session.kind : 'gate', deviceOf(req), now.toISOString(), new Date(now.getTime() + HANDOFF_MINUTES * 60000).toISOString()).run();
  return token;
}
// Used once, from the same kind of device, before it runs out. Returns the code's row, or null.
export async function takeHandoff(env, req, token) {
  if (!tokenOk(token)) return null; const id = await A.sha256hex(token); const now = new Date().toISOString();
  const row = await env.DB.prepare('SELECT * FROM app_handoffs /* all-families: by secret code */ WHERE id=? AND used_at IS NULL AND expires_at > ?').bind(id, now).first();
  if (!row || (row.device && row.device !== deviceOf(req))) return null;
  const r = await env.DB.prepare('UPDATE app_handoffs SET used_at=? WHERE id=? AND used_at IS NULL /* all-families: by secret code */').bind(now, id).run();
  return r?.meta?.changes === 0 ? null : row;
}

// The first thing the new app loads, before it has signed in. Only the app from the home screen uses the code;
// the same address opened in a browser just goes on to the sign-in page.
export const openingPage = (token, name) => new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><meta name="theme-color" content="#1f3a5f"><meta name="apple-mobile-web-app-capable" content="yes"><title>${A.escHtml(name)}</title><link rel="manifest" href="/manifest.webmanifest?app=${token}"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="icon" href="/icon.svg">
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#eaf7ee;font-family:system-ui,-apple-system,sans-serif;color:#1f3a5f;font-weight:800;font-size:20px"><p>Opening the app…</p>
<script>(async () => { const app = matchMedia('(display-mode: standalone)').matches || navigator.standalone; if (app) { try { await fetch('/auth/app/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: '${token}' }) }); } catch {} } location.replace('/'); })();</script></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY' } });
