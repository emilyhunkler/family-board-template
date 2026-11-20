// Saves a full copy of the live database to backups/ before a release (backups/ is never committed,
// since it holds families' data). Run: npm run backup            (or: node scripts/backup.mjs --env staging)
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const staging = process.argv.includes('--env') && process.argv[process.argv.indexOf('--env') + 1] === 'staging';
const db = staging ? 'family_board_staging' : 'family_board';
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
mkdirSync('backups', { recursive: true });
const out = `backups/${db}-${stamp}.sql`;
const args = ['wrangler', 'd1', 'export', 'DB', '--remote', '--output', out, ...(staging ? ['--env', 'staging'] : [])];
console.log(`Backing up ${db} to ${out} ...`);
execFileSync('npx', args, { stdio: 'inherit' });
console.log(`Saved ${out}. Keep it somewhere safe and private, not in the repo.`);
