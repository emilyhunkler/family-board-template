# Releasing a change

Families use the board every day, and kids watch their stars and pay. A release should never surprise
them. Every change goes: pull request → test copy → live, with a backup first.

## How changes go out

- **Test copy:** GitHub deploys it by itself after every merge to `main` (the "Deploy test copy" action).
  To try a pull request before it's merged, open Actions → Deploy test copy → Run workflow and pick the
  pull request's branch. The test board is the Worker `family-board-staging` with its own database,
  `family_board_staging`, so nothing there touches real families.
- **Live board:** only by hand, from Actions → Deploy live board → Run workflow on `main`, typing `live` to
  confirm. It runs the tests, records a restore point for the live database, adds any new tables, then
  deploys the Worker `familyboard-kitchen` (`[env.live]` in `wrangler.toml`).
- From a computer, `npm run deploy:staging` and `npm run deploy` do the same two things.

## One-time setup

1. **Make a Cloudflare token.** In Cloudflare: My Profile → API Tokens → Create Token → Custom token, with
   these permissions on the account that has the board, and nothing else:
   - Account · Workers Scripts · Edit
   - Account · D1 · Edit
   - Account · Account Settings · Read
2. **Add three secrets on GitHub.** In this repo: Settings → Secrets and variables → Actions → New
   repository secret.
   - `CLOUDFLARE_API_TOKEN`: the token from step 1.
   - `CLOUDFLARE_ACCOUNT_ID`: from the Cloudflare dashboard, Workers & Pages, shown on the right.
   - `STAGING_SETUP_CODE`: any code you like, used to set up a pretend family on the test board.
3. **Run the test copy once:** Actions → Deploy test copy → Run workflow on `main`. The test board is then
   at `family-board-staging.<your-subdomain>.workers.dev`. Open it, type the setup code and make a pretend
   family with two kids and a few chores.
4. **Make sure Cloudflare isn't also deploying on its own.** Workers & Pages → familyboard-kitchen →
   Settings → Build. If a GitHub repo is connected there, disconnect it, so the live board changes only
   when someone runs "Deploy live board".

## Every release

1. **Pull request.** The Tests check on GitHub must be green. Add a line to CHANGELOG.md under Unreleased.
2. **Test copy.** Run "Deploy test copy" on the pull request's branch. On the test board, check what the
   change touches, as a kid and as a grown-up, on the tablet and on a phone. To see another day, open the
   board with `?date=YYYY-MM-DD` on the end of its address.
3. **Merge**, then **pick the time.** Go live the night after pay day, once the week has closed, and never
   on a school morning. A new week then starts under the new rules.
4. **Go live.** Run "Deploy live board" on `main` and type `live`.
5. **Check the live board** for a minute, then put today's date on the changelog entry.

## Database changes

- A migration may only **add**: new tables, indexes or columns. The tests fail on anything that drops,
  deletes or rewrites rows, so stars, pay and history are never changed by a release.
- A change that really must touch existing rows needs its own written plan and the line
  `-- reviewed: changes existing data` at the top of the migration.
- New code must still work if its migration hasn't run yet.

## If something goes wrong

- **Code:** `npx wrangler rollback --env live` puts the last version back. Added tables don't bother older
  code.
- **Data:** the summary of the "Deploy live board" run gives the exact restore command for the moment just
  before that release. Cloudflare keeps 30 days of the database's history. `npm run backup` from a computer
  saves a full copy to `backups/` too (never committed, since it holds families' data).
