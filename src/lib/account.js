// A family's own data and the site's housekeeping: public feedback with names removed, the privacy page,
// download and delete for a family, and the owner's overview of a shared site.
import { page, escHtml } from './auth.js';

// Every table that holds one family's rows, in the order they are deleted (sign-in last).
export const FAMILY_TABLES = ['checks', 'quest_claims', 'todos', 'ledger', 'groceries', 'meals', 'notes', 'cache', 'events_log', 'feedback', 'reward_requests', 'photos', 'push_subs', 'quiz_runs', 'day_plans', 'cash_requests', 'pairings', 'invites', 'settings', 'sessions', 'users'];
// Settings that are keys or codes, never part of a download.
export const SECRET_SETTINGS = new Set(['vapid', 'recovery', 'gate', 'setup_ticket', 'origin']);

// Feedback that goes somewhere public: the board's own names become [kid], [grown-up], [pet] or [family].
export function redact(text, cfg) {
  const words = [];
  const add = (w, tag) => { w = String(w || '').trim(); if (w.length >= 2) words.push([w, tag]); };
  for (const k of cfg.kids || []) add(k.name, '[kid]');
  for (const p of cfg.family?.parents || []) { add(p.name, '[grown-up]'); for (const m of p.match || []) add(m, '[grown-up]'); }
  add(cfg.family?.dog, '[pet]'); add(cfg.family?.name, '[family]');
  words.sort((a, b) => b[0].length - a[0].length); // "Mom Smith" before "Mom"
  let out = String(text || '');
  for (const [w, tag] of words) out = out.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'giu'), `$1${tag}`);
  return out.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]').replace(/\+?\d[\d\s().-]{7,}\d/g, '[phone]');
}

export function privacyPage({ site, contact, updated }) {
  const reach = contact ? `email <a href="mailto:${escHtml(contact)}">${escHtml(contact)}</a>` : 'tap 💬 Ideas on your board';
  return page(`Privacy · ${site}`, `<style>.card{width:min(680px,100%)}h2{font-size:16px;color:#1f3a5f;margin:18px 0 4px}.card p{font-size:15px}</style><h1>Privacy</h1><p>${escHtml(site)} is a small, independent family board run by a parent, not a company. Last updated ${escHtml(updated)}.</p>
  <h2>What the board keeps</h2><p>What your family puts on it: names, the calendar link you add and its events, chores, stars, groceries, meals, notes, photos and settings. For each grown-up, an email address and name. For each signed-in device, its type (like "iPad, Safari") and when it was last used. Passwords are stored scrambled, so nobody can read them.</p>
  <h2>Who can see it</h2><p>Only devices signed in to your family's board. Other families can't see anything of yours. The person who runs the site can reach the database to keep it working, and only looks at a family's board when that family asks for help.</p>
  <h2>What we never do</h2><p>No ads. No selling or sharing your information. Nothing is used to train AI.</p>
  <h2>Services the board uses</h2><p><b>Cloudflare</b> runs the site and stores the data, and makes the natural-sounding voice from the words the board says out loud. <b>Google</b> is used only if you choose Continue with Google, and shares your name and email. <b>Open-Meteo</b> gets your town's location for the weather. Your <b>calendar</b> service is asked for your events every 15 minutes, using the link you added. If a grown-up turns on smarter voice help in settings, unusual spoken sentences go to <b>Anthropic</b> to be understood.</p>
  <h2>Feedback</h2><p>Ideas and feedback sent from the board are posted publicly on GitHub so they can be tracked and fixed. Names from your board are removed first, but please don't include anything private.</p>
  <h2>Kids</h2><p>Kids don't have accounts. A grown-up adds them to the family's board, and only signed-in family devices can see it.</p>
  <h2>Your choices</h2><p>A signed-in grown-up can download everything or delete the family's board at any time on the <a href="/account">Your board</a> page (Grown-ups, then Sign-in and devices). Deleting removes it right away; backup copies disappear within 30 days.</p>
  <h2>Questions</h2><p>To ask anything or to have your data removed, ${reach}.</p><p class="more"><a href="/">Back to ${escHtml(site)}</a></p>`);
}

export function accountPage({ site, family, msg = '', isOwner }) {
  return page('Your board', `<h1>${escHtml(family)}</h1><p>Your family's board on ${escHtml(site)}.</p>${msg ? `<p class="e">${escHtml(msg)}</p>` : ''}
  <a href="/account/export"><button type="button">Download all our data</button></a><p style="margin-top:8px">One file with everything on your board, including photos.</p>
  <details><summary>Delete our board</summary><p style="margin-top:8px">This removes your family's board for good: calendar link, chores, stars, photos, every grown-up's sign-in and every device. It can't be undone. Download your data first if you might want it.</p>
  <form method="post" action="/account/delete"><label for="n">Type your board's name to confirm: <b>${escHtml(family)}</b></label><input id="n" name="name" type="text" autocomplete="off" required>
  <button style="background:#b00020">Delete our board forever</button></form></details>
  <p class="more"><a href="/privacy">Privacy</a> · <a href="/">Back to the board</a>${isOwner ? ' · <a href="/owner">Site overview</a>' : ''}</p>`, msg ? 400 : 200);
}

export const deletedPage = (site) => page('Board deleted', `<h1>Your board is deleted</h1><p>Everything from your family's board is gone. Thanks for trying ${escHtml(site)}.</p><a href="/"><button type="button">Done</button></a>`);

// The owner's overview: how many families, how active, how much space. Never a family's contents.
export function ownerPage({ site, families, totals, feedback, signupOpen }) {
  const mb = (b) => (b / 1048576).toFixed(1) + ' MB';
  const rows = families.map((f) => `<tr><td>${f.id}</td><td>${escHtml(f.name || '')}</td><td>${String(f.created_at || '').slice(0, 10)}</td><td>${f.grownups}</td><td>${f.devices}</td><td>${f.last_seen ? String(f.last_seen).slice(0, 16).replace('T', ' ') : 'never'}</td><td>${f.checks}</td><td>${f.photos} · ${mb(f.photo_bytes || 0)}</td></tr>`).join('');
  const fb = feedback.map((x) => `<li><b>#${x.household_id}</b> ${escHtml(String(x.created_at).slice(0, 10))}: ${escHtml(String(x.text).slice(0, 160))}${x.issue_url ? ` <a href="${escHtml(x.issue_url)}">issue</a>` : ''}</li>`).join('');
  return page(`Overview · ${site}`, `<style>.card{width:min(900px,100%)}td,th{padding:6px 8px;border-bottom:1px solid #e3eee7;vertical-align:top}</style><h1>${escHtml(site)} overview</h1><p>${families.length} families · ${totals.grownups} grown-ups · ${totals.devices} active devices · photos ${mb(totals.photo_bytes)}. Sign-up is <b>${signupOpen ? 'open with an invite code' : 'closed'}</b>.</p>
  <div style="overflow-x:auto"><table style="font-size:13px;border-collapse:collapse;width:100%"><tr style="text-align:left"><th>#</th><th>Family</th><th>Joined</th><th>Grown-ups</th><th>Devices</th><th>Last seen (UTC)</th><th>Check-offs</th><th>Photos</th></tr>${rows}</table></div>
  <h2 style="font-size:16px;margin-top:18px">Recent feedback</h2><ul style="font-size:13px;padding-left:18px">${fb || '<li>None yet</li>'}</ul><p class="more"><a href="/">Back to the board</a></p>`);
}
