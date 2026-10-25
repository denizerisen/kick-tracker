# Kick Tracker

A tiny baby kick counter. Tap **Kick!** each time the baby kicks; each tap is saved with its timestamp, and charts show which hours of the day (and which days) have the most kicks.

## Features

- One-tap logging, plus undo for the last kick and a form to log past kicks (date, time, count).
- Sessions: kicks less than 10 minutes apart are grouped automatically. Tag a session (Coffee, Breakfast, … or your own tag) and add a note, either right after kicking or later from the Recent sessions list.
- Two charts: kicks by hour of day and kicks per day.
- Optional baby's name, shown in the header and chart headings (synced when signed in).
- Light/dark theme toggle and an English/Turkish language toggle.
- Installable PWA with an offline app shell and a home-screen shortcut ("Log a kick", opens `./?kick=1`).
- Optional sign-in with an emailed one-time code. Signed-in kicks sync across devices through Supabase.
- Works signed out too: kicks are kept in the browser (`localStorage`) and synced when you sign in. Offline taps are queued and uploaded later.
- Export/Import JSON to back up or move data.

## Tech

No build step and no dependencies to install: plain `index.html`, `app.js` and `style.css`. The only external script is `supabase-js`, loaded from a CDN.

## Run locally

Serve the folder over HTTP (the service worker and sign-in need it, `file://` won't work):

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Tests

End-to-end tests in a real browser, on a desktop and a phone (Playwright). They never touch Supabase:
sync is tested against a small stand-in (`e2e/fake-supabase.js`).

```sh
npm install
npx playwright install chromium
npm test
```

GitHub Actions runs them on every push to `dev` or `main` and every pull request.

## Deploy

Host the folder as static files, e.g. GitHub Pages. When you ship changes, bump `CACHE` in `sw.js` so installed copies pick up the new files.

## Supabase setup (for sync and sign-in)

1. Create a Supabase project and set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `config.js`. The anon key is meant to be public; row-level security keeps each user's data private.
2. In the SQL Editor, run [supabase-schema.sql](supabase-schema.sql). It creates the `kicks` and `profiles` (baby's name) tables, with policies so users can only read and write their own rows. The file is safe to re-run, so run it again after pulling schema changes. If your `kicks` table predates session tags, run its `alter table ... add column if not exists tag ..., note ...` line before deploying, or sync will fail until you do.
3. Enable email auth, and paste [supabase/templates/sign-in-code.html](supabase/templates/sign-in-code.html) into the **Magic Link** (or **Confirm signup**) email template so the email shows the 6-digit `{{ .Token }}` code.

Secrets such as `.env.local` are git-ignored.

## Roadmap

- Kick-count sessions ("10 kicks in how long?")
- Other baby events (feeding, sleep, diapers)
- Reminders
- Share with a partner
