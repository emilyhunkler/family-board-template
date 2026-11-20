# Changelog

What changed on the board, newest first. Each release says what families will notice, then what changed
behind the scenes. Add a line under **Unreleased** in the same pull request as the change, and give it a
date when it goes live (see RELEASING.md).

## Unreleased

### For families
- Kids' bank: each kid has a bank balance that a grown-up keeps safe, with a list of money in and out. Any savings jar money a kid already had is their opening balance.
- Cha-ching pay day: once the week closes on your family's pay day, each kid gets a pay day screen with coins, a sound and the week's pay, and picks "Cash please" or "Bank it". Pay not collected that night waits for them.
- "Ask for cash" on each kid's page, any time, up to what's in their bank. A grown-up taps "I handed it over" (or "Not now") in grown-up settings, and only then does it leave the bank.
- Grown-ups can turn the bank off under Money. With it off, pay day works as before.
- Stars and pay a kid already has no longer go down when grown-ups change the chores. The week's bar is set when the week starts, so a chore or one-off job added mid-week is a chance to earn more. Pay never goes over the allowance. (#3)
- A take-turns chore that's already done stays with the kid who did it, even if the turns move later. (#3)
- New "My week" chart on each kid's page: one bar per day for stars earned, bonus, missed and still to earn. Tap a day to see its chores. (#3)
- A test copy of the board shows a "Test copy" banner, so it's never mistaken for the real one.
- The board stays within Cloudflare's free plan: calendars no longer use up each screen's time allowance, so screens stop showing errors or an old calendar. A daily repeat that started many years ago shows again.

### Behind the scenes
- New `cash_requests` table (migration 0010). Money out of the bank is a new `cashout` ledger row; money in is a `jar` row. Pay day totals are kept for 6 weeks in the `paychecks` setting, and a week can only be paid once.
- The pretend test family's pay day is the day it's loaded, so the pay day screen shows straight away, and Lily starts with $4 saved.
- New `day_plans` table saves each day's chore list (migration 0009). The week's starting bar is kept in the `weekbar` setting. (#3)
- Deploys from GitHub: the test copy updates after every merge, and the live board goes out only when someone runs "Deploy live board" by hand, with a restore point first.
- Staging: a separate test board and database (`npm run deploy:staging`), tests on every pull request, a backup before every live deploy, and a release checklist.
- Calendar speed: time-zone math asks Intl once per stretch of days instead of once per event, repeats jump straight to the shown weeks instead of walking from their first date, events far outside the shown weeks are skipped while reading the feed, and the 15-minute job only works a calendar out again when the feed really changed (it ignores Google's per-download time stamps). Screens use the saved result for up to an hour. Event notes are kept to the 400 characters the board shows.

## 2026-11-19
- Small updates.

## 2026-11-18
- First release: calendar, weather, routines and chores, stars, allowance and pay day, weekly prize, avatars and wardrobe, groceries, meals, notes, voice, brain quests, mascot, dark mode, kitchen screen pairing, and one site for many families with each family's data kept separate.
