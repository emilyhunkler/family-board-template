// Pages for a shared site: a new family signs up, and a kitchen screen joins a family with a short code.
import { page, escHtml } from './auth.js';

// Codes avoid look-alike characters (no 0/O, 1/I/L), so they are easy to read across the kitchen.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function pairCode() { const r = crypto.getRandomValues(new Uint8Array(6)); let s = ''; for (const x of r) s += CODE_CHARS[x % CODE_CHARS.length]; return s; }
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const showCode = (c) => c.slice(0, 3) + ' ' + c.slice(3);

const googleIcon = '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

export function signupPage({ site, google, msg = '', v = {} }) {
  const f = (k) => escHtml(v[k] || '');
  return page('Create your board', `<h1>Create your family's board</h1><p>${escHtml(site)} is in early testing, so you need an invite code. Setup takes about ten minutes.</p>${msg ? `<p class="e">${escHtml(msg)}</p>` : ''}
  <form method="post" action="/auth/signup"><input type="hidden" name="zone" id="z" value="${f('zone')}">
  <label for="c">Invite code</label><input id="c" name="code" type="text" autocomplete="off" autocapitalize="characters" required value="${f('code')}">
  <label for="fam">Family name</label><input id="fam" name="family" type="text" placeholder="Like The Garcias" maxlength="40" required value="${f('family')}">
  <label for="me">What the kids call you</label><input id="me" name="person" type="text" placeholder="Like Mom, Dad or Grandpa" maxlength="30" required value="${f('person')}">
  ${google ? `<button class="g" name="method" value="google">${googleIcon}Continue with Google</button><details><summary>Use an email and password instead</summary>` : ''}
  <label for="e">Email</label><input id="e" name="email" type="email" autocomplete="username" value="${f('email')}">
  <label for="p">Password</label><input id="p" name="password" type="password" autocomplete="new-password" minlength="10" placeholder="At least 10 characters">
  <button name="method" value="password">Create our board</button>${google ? '</details>' : ''}</form>
  <p class="more"><a href="/">Already have a board? Sign in</a></p>
  <script>try{document.getElementById('z').value||(document.getElementById('z').value=Intl.DateTimeFormat().resolvedOptions().timeZone)}catch(e){}</script>`, msg ? 400 : 200);
}

export const welcomePage = (code) => page('Welcome', `<h1>Your board is ready 🎉</h1><p>Save this recovery code somewhere safe, like your password manager. It's the way back in if you ever forget your password.</p><div class="code" style="font-size:22px;letter-spacing:.08em">${escHtml(code)}</div><p>Next, a few quick questions to make the board yours.</p><a href="/"><button type="button">Let's set it up</button></a>`);

// The kitchen screen: shows its code and checks every few seconds whether a grown-up has entered it.
export function pairPage({ code, origin, site }) {
  const host = origin.replace(/^https?:\/\//, '');
  return page('Pair this screen', `<h1>Set up this screen</h1><p>On a grown-up's phone that's signed in to ${escHtml(site)}, open <b>${escHtml(host)}/link</b> and type this code:</p>
  <div class="code">${escHtml(showCode(code))}</div><p id="s">Waiting for the code… It works for 15 minutes.</p><p class="more"><a href="/">Sign in another way</a></p>
  <script>(function t(){fetch('/auth/pair/status',{cache:'no-store'}).then(function(r){return r.json()}).then(function(j){if(j.ok){document.getElementById('s').textContent='Joined! Opening the board…';location.href='/';}else if(j.expired){location.reload();}else setTimeout(t,3000);}).catch(function(){setTimeout(t,5000)});})();</script>`);
}

// The grown-up's phone: type the code from the kitchen screen.
export function linkPage({ msg = '', ok = '', family = '' }) {
  if (ok) return page('Screen added', `<h1>Screen added ✓</h1><p class="ok">${escHtml(ok)}</p><a href="/"><button type="button">Back to the board</button></a>`);
  return page('Add a kitchen screen', `<h1>Add a kitchen screen</h1><p>Type the code showing on the screen. It will join ${family ? 'the board for ' + escHtml(family) : 'your board'} and stay signed in for the kids.</p>${msg ? `<p class="e">${escHtml(msg)}</p>` : ''}
  <form method="post" action="/link"><input name="code" type="text" autocomplete="one-time-code" autocapitalize="characters" autofocus maxlength="9" placeholder="ABC 123" required style="font-size:30px;letter-spacing:.15em;text-align:center"><button>Add this screen</button></form>`, msg ? 400 : 200);
}
