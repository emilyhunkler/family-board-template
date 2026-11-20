# Releasing a change

Families use the board every day, and kids watch their stars and pay. A release should never surprise
them. Every change goes: pull request → test copy → live, with a backup first.

## One-time setup

1. **Make the test copy's database.** Done: `family_board_staging` is in the same Cloudflare account as
   the live board, and its ID is in `wrangler.toml` under `[env.staging]`.
2. **Sign in to Cloudflare from the computer you deploy from:** `npx wrangler login` (the account that has
   the live board).
3. **Deploy it:** `npm run deploy:staging`. This sets up the test database's tables and puts the test board
   at `family-board-staging.<your-account>.workers.dev`.
4. **Give the test copy a setup code:** `npx wrangler secret put SETUP_CODE --env staging`, then open the
   test board, type the code and make a pretend family with two kids and a few chores.
5. **Check how live deploys happen.** The live board is the Worker named `familyboard-kitchen`, and this
   repo's `wrangler.toml` still says `family-board`. Until they match, keep deploying the live board the way
   you do now, and don't run `npm run deploy` from this repo, which would make a second Worker.
   In Cloudflare: Workers & Pages → familyboard-kitchen → Settings → Build.
   - If a GitHub repo is connected, every merge to `main` goes live on its own. Set the deploy command to
     `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy` so database changes go out too.
   - Turn off builds for other branches. Their preview links use the **live** database.
   - If nothing is connected, live deploys only happen when someone runs `npm run deploy`.

## Every release

1. **Pull request.** The Tests check on GitHub must be green. Add a line to CHANGELOG.md under Unreleased.
2. **Test copy.** From the pull request's branch run `npm run deploy:staging`. On the test board, check
   what the change touches, as a kid and as a grown-up, on the tablet and on a phone. To see another day,
   open the board with `?date=YYYY-MM-DD` on the end of its address.
3. **Pick the time.** Go live the night after pay day, once the week has closed, and never on a school
   morning. A new week then starts under the new rules.
4. **Go live.** `npm run deploy` runs the tests, backs up the live database to `backups/`, applies any new
   migrations, then deploys. (If Cloudflare builds from GitHub, run `npm run backup` first, then merge.)
5. **Check the live board** for a minute, then put today's date on the changelog entry.

## Database changes

- A migration may only **add**: new tables, indexes or columns. The tests fail on anything that drops,
  deletes or rewrites rows, so stars, pay and history are never changed by a release.
- A change that really must touch existing rows needs its own written plan and the line
  `-- reviewed: changes existing data` at the top of the migration.
- New code must still work if its migration hasn't run yet.

## If something goes wrong

- **Code:** `npx wrangler rollback` puts the last version back. Added tables don't bother older code.
- **Data:** `npx wrangler d1 time-travel restore family_board --timestamp=<time before the release>`
  puts the database back to that moment. The file in `backups/` is the second safety net.
