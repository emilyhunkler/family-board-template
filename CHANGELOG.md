# Changelog

What changed on the board, newest first. Each release says what families will notice, then what changed
behind the scenes. Add a line under **Unreleased** in the same pull request as the change, and give it a
date when it goes live (see RELEASING.md).

## Unreleased

### For families
- Buying in the wardrobe works again. A kid's 👕 Wardrobe button now always opens that kid's own wardrobe. Before, it stayed on whichever kid was open first, so Lydia could end up shopping with Ivette's stars and be told she needed more.
- Tapping something not owned yet opens a calm card on the board itself with just the facts, like "Big bow costs 6 stars" and how many stars the kid has, and two big buttons, "Get it" and "Keep saving". It used to use the browser's own yes/no box, which an iPad can hide or skip. Items a kid can afford have a gold price tag; for the rest, the card says plainly how many more stars to go.
- Feedback: one press of Send sends one note. The button says "Sending…" until it's done, then "Thank you! It's sent." The same note sent again within 10 minutes isn't saved twice.

## 2026-11-22

### For families
- New families can find sign-up at a glance. The sign-in page now has a big "Create your family's board" button under the sign-in, where before it was a small link at the very bottom that was easy to miss.
- A sign-up link can carry the invite code, like `/auth/signup?code=SPRING-25`, so the code is already filled in.

### Behind the scenes
- The site overview (`/owner`) lists a ready-made sign-up link for each invite code.
- The test copy takes the invite code `TEST-FAMILY`, so new-family sign-up can be tried there.

## 2026-11-20

### For families
- The bottom tab bar shows each kid as their own avatar again. A pet sticker on a kid's avatar was showing so big there that it covered the kid's face.
- The photo screensaver no longer runs under the iPad's clock, Wi-Fi and battery at the top of the screen when the board is installed on the home screen.
- On the kitchen screen, "Send list" on the Groceries page now sends the list straight to the grown-ups' phones, so nobody gets asked to sign in to WhatsApp or email on the shared tablet. Pick Everyone or one grown-up. If no phone is set up yet, it says how: on each phone, open the board and tap Turn on notifications. On phones, Send list still opens WhatsApp, Messages, email and the rest.
- The board's pet or sidekick is now the family's guide. It sits big near the top of the home screen with something to say, and shows today's plan: "Jobs first" with how each kid is doing, then "Then family time" with one off-screen idea. With None picked, the board shows the plan without any pet talk.
- A family idea of the day: one thing to do together away from the screen, like a walk, a card game, music practice, calling Grandma or baking. It fits the season, the weather (no bike rides in the rain, snowmen only when it snows) and the day (bigger outings on weekends). "We did it! 🎉" marks it done for the day and "Another idea" swaps it. Every screen in the house shows the same idea. Grown-ups can add their own ideas, use only their own, give stars for doing it (none by default, just a cheer), or turn it off, under Family and calendar → Family time.
- A "Go play!" break on the kitchen screen: after a few minutes of tapping with nothing getting done, the board says it's time to go play (or do jobs first, get ready for school, or wind down for bed), gives today's idea, and goes quiet for a while. It opens with a kind "Time's up! ⏰" and a question to think about, like "You've been tapping for 5 minutes. Did that get a job done?" (five wordings take turns) and who still has jobs, then "Okay, what now?" shows the plan. Kids can still open their own page to do jobs or collect pay day, and grown-ups can still open settings or end the break with the PIN. It never covers a kid's page, the pay day screen or grown-up settings. Grown-ups set the minutes (5 by default), the length of the break (15 minutes) or turn it off, and "Show the Go play screen" there shows it straight away.
- Get the app: the board installs on phones, tablets and computers like any other app, with its own icon, full screen and no browser bars. A "Get the app" offer shows once at the bottom of the board ("Not now" puts it away), and it's always under grown-up settings → Screen and sound → Get the app, plus a yellow button at the top of grown-up settings. Each device sees only its own steps, with big pictures: one Install button on Android phones and on Chrome or Edge, Share then Add to Home Screen on iPhones and iPads (with the newer ••• step on iOS 26), and "open this in Safari first" when the board was opened inside another app.
- The "Get the app" offer only shows on a device that doesn't have the app yet. It never shows inside the app. Once a phone, tablet or computer has opened the board from its icon, or installed it, that device stops offering it, and an iPhone or iPad's Safari stops too once the app it set up has opened. If someone deletes the app, "Show the steps anyway" brings the steps back.
- The app opens already signed in to your family. iPhones and iPads give a home-screen app its own storage, so before showing the steps the board makes a one-time code that the new app uses once to sign itself in (the kitchen tablet stays a kitchen display). If that ever doesn't work, the app shows the usual sign-in page with a "Welcome to the app" note.
- With no internet, the app shows a friendly "No internet right now" screen and opens the board again by itself once the internet is back. New versions still reach everyone straight away.
- A calmer grown-ups settings screen. Six groups down the side (Today, Chores and stars, Money and pay day, Family and calendar, Screen and sound, Advanced), with each group's pages as tabs along the top. On a phone the six groups sit in two short rows, so nothing hides off the edge. Longer explanations sit behind a "How this works" tap, and long lists (shop items, money history, extra voice options) open when you want them. Every setting is still there and nothing saved changes.
- The old Settings page is now three: Family and kids (names, colors, ages, time zone, pet or sidekick, calendar color words), Kitchen screen (colors, night mode, morning screen, screensaver) and PIN and setup (under Advanced). The money page puts this week's pay first and the pay rules below it. Leave-for-school times are on School days only (they were also on the money page).
- "Dog" is now "Pet or sidekick": pick a pet (dog, cat, bunny and more), a character, or None, then their name. Picking None clears the name, so nothing on the board talks about a pet. A board that only had a name keeps it as a dog, as before.
- "Who is each event for?" is now "Calendar color words", with a one-line example right there. The "How this works" taps now look like something you can tap.
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
- Today's family idea is picked on each screen from a built-in list (public/ideas.js), so it adds no work to the Worker or the 15-minute job. The Worker keeps one small `idea` setting per family (which idea is on today, whether it's done, the last 30 done) and a new `POST /api/idea`. Stars for a family idea are bonus-quest claims, so they follow the usual "needs a grown-up's OK" rule. No new tables.
- New `ideas` and `nudge` settings, filled in with their defaults for every family. Opening the board with `?goplay` on the end shows the "Go play!" screen for two minutes, for trying it out.
- New `app_handoffs` table (migration 0011): one-time codes for a new iPhone or iPad app, kept as SHA-256 only, good for 20 minutes, used once, only from the same kind of device, and only by the app opened from the home screen (the same link opened in a browser just shows sign-in). Removed with the family's other data on delete.
- Migration 0012 adds `from_session` to `app_handoffs` (the SHA-256 id of the browser session that made the code). Used codes are now kept, so `GET /api/app/status` can tell that browser its app has opened. The manifest lists itself in `related_applications`, so Chrome's `getInstalledRelatedApps` can report the app from a browser tab.
- The web app manifest is now made by the Worker (name from SITE_NAME, or "Family Board"), with separate "any" and "maskable" icons. The service worker keeps the board's own files fresh from the network, keeps versioned libraries and fonts for a quick start, shows `offline.html` (served at `/offline`) when there's no internet, and never stores anything from `/api` or sign-in.
- New test: every setting the grown-ups screen could change before the tidy-up is still on it, and every page in the side list has something to show.
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
