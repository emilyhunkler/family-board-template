// Saves the Google sign-in client ID and secret to the live board as Cloudflare secrets.
// Run: ~/.nvm/versions/node/v22.22.0/bin/node scripts/setup-google.mjs
import readline from 'node:readline/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const bin = path.dirname(process.execPath); const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
const put = (name, value) => new Promise((res, rej) => { const p = spawn(path.join(bin, 'npx'), ['wrangler', 'secret', 'put', name], { env, stdio: ['pipe', 'inherit', 'inherit'] }); p.stdin.end(value + '\n'); p.on('close', (c) => (c === 0 ? res() : rej(new Error('wrangler exited ' + c)))); });
console.log('\nFamily Board: connect Google sign-in\n');
const id = (await rl.question('Paste the Client ID (ends in .apps.googleusercontent.com): ')).trim();
if (!/\.apps\.googleusercontent\.com$/.test(id)) { console.log('That does not look like a Google Client ID. Run this again.'); process.exit(1); }
const secret = (await rl.question('Paste the Client secret (starts with GOCSPX-): ')).trim();
if (secret.length < 10) { console.log('That secret looks too short. Run this again.'); process.exit(1); }
rl.close();
await put('GOOGLE_CLIENT_ID', id); await put('GOOGLE_CLIENT_SECRET', secret);
console.log('\nSaved. Open the board, tap the gear, and go to Sign-in and devices: you should see "Turn on sign-in with Google". You can close this tab.');
