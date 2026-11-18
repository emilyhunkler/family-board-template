# Family Board

A cheerful family board for a kitchen tablet. It shows your shared calendar, the weather, and each kid's routines and chores. Kids earn stars toward an allowance and a weekly prize, and they can dress up their own avatar. Grown-ups get a grocery list and meal plan on their phones.

Your board runs in your own free Cloudflare account. Your family's data stays there and nobody else can see it.

## What you need

- A free Cloudflare account.
- A tablet or old iPad for the kitchen, and your phones.
- Optional: the private iCal link of your family calendar (Google, iCloud or Outlook).

## Set it up (about 15 minutes)

1. Click the button below and sign in to Cloudflare.

   [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/emilyhunkler/family-board-template)

2. When it asks for **SETUP_CODE**, make up a code that's hard to guess, like `blue-pancake-42`. You only use it once.
3. Wait for the deploy to finish, then open your board's address. It ends in `workers.dev`.
4. Type your setup code. The setup steps walk you through:
   - your board's name, the grown-ups and the kids
   - pets, who become the board's mascot
   - your town, for weather
   - your family calendar link
   - starter chores, picked by age
   - each kid's avatar
   - a grown-up PIN and your sign-in
5. On the kitchen tablet, sign in and tick "This device is the shared family screen". Then add it to the home screen. On an iPad, that's Share, then Add to Home Screen.
6. Invite the other grown-ups from **Parents → Sign-in and devices**.

You can change anything later in **Parents**, or walk through the steps again with **Parents → Settings → Run setup again**.

## Optional: Sign in with Google

Password sign-in works out of the box. To add a "Continue with Google" button:

1. Create an OAuth client of type "Web application" in Google Cloud Console.
2. Add `https://YOUR-BOARD.workers.dev/auth/google/callback` as an authorized redirect URI.
3. Run `node scripts/setup-google.mjs` and paste the client ID and secret.

## Costs

It fits in Cloudflare's free plan for a family. The natural-sounding voice uses Workers AI, which has a free daily allowance.

## Credits

Avatars: Adventurer by Lisa Wischofsky (CC BY 4.0) via DiceBear. Dog drawing from OpenMoji (CC BY-SA 4.0). Weather: Open-Meteo.
