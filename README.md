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
5. On the kitchen tablet, tap **Get a pairing code**. On your phone, open `YOUR-BOARD.workers.dev/link` and type the code. The tablet opens the board and stays signed in. (You can also sign in on the tablet and tick "This is our family's kitchen display".) Then tap **Get the app** on the board and follow the pictures, so it opens full screen like any other app.
6. Invite the other grown-ups from **Parents → Advanced → Sign-in and devices**.

You can change anything later in **Parents**, or walk through the steps again with **Parents → Advanced → PIN and setup → Run setup again**.

## Optional: Sign in with Google

Password sign-in works out of the box. To add a "Continue with Google" button:

1. Create an OAuth client of type "Web application" in Google Cloud Console.
2. Add `https://YOUR-BOARD.workers.dev/auth/google/callback` as an authorized redirect URI.
3. Run `node scripts/setup-google.mjs` and paste the client ID and secret.

## Optional: Host boards for other families

One copy can hold many families, each with its own private board. This is off unless you turn it on. Without it, your copy is just for your family.

Set two settings in Cloudflare (Workers & Pages → your board → Settings → Variables and Secrets):

- **SITE_NAME**: the name people see on the sign-in page, like `Our Town Boards`. With it set, the sign-in page never shows any family's name.
- **SIGNUP_CODES**: one or more invite codes, separated by commas, like `SPRING-25, NEIGHBORS`. A **Create your family's board** link appears on the sign-in page, and a new family needs one of these codes to sign up. Remove the setting to close sign-up again.

Each new family gets its own setup steps, its own PIN and its own kitchen screen pairing. No family can see another's calendar, chores, photos or settings.

A few more optional settings for a shared site:

- **OWNER_EMAILS**: your own sign-in email. You get a **Site overview** page at `/owner` showing how many families joined and how active they are, never what's on their boards.
- **CONTACT_EMAIL**: the address shown on the privacy page (`/privacy`) for questions and removal requests.
- **FEEDBACK_REPO** and **GITHUB_TOKEN**: a public GitHub repo like `you/your-repo`, and a fine-grained token that can only write that repo's issues. Each family's in-app feedback becomes an issue there, with the names on their board, emails and phone numbers removed, and the feedback box tells them it's public.

Every family can download all its data or delete its board from `/account`.

## Making changes safely

If families use your board every day, try changes on a separate test copy first and go live at the week's
end. RELEASING.md has the steps, and CHANGELOG.md lists what changed.

## Costs

It fits in Cloudflare's free plan for a family. The natural-sounding voice uses Workers AI, which has a free daily allowance.

## Credits

Avatars: Adventurer by Lisa Wischofsky (CC BY 4.0) via DiceBear. Dog drawing from OpenMoji (CC BY-SA 4.0). Weather: Open-Meteo.
