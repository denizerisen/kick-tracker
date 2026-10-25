# Kick Tracker

A tiny baby kick counter: tap to log kicks, see which hours and days have the most, group them into
tagged sessions. Signed out it keeps everything in `localStorage`; signed in (6-digit email code) it
syncs through Supabase.

Lite project: plain HTML/CSS/JS (`index.html`, `app.js`, `style.css`, `i18n.js`), no build step and no
runtime dependencies. GitHub Pages serves `main` at https://denodan.com/kick-tracker/; work happens on
`dev`. Run locally with `python3 -m http.server 8000`.

- **Tests:** `npm test` (Playwright e2e, desktop + phone). `package.json` is dev tools only. Tests
  import `./fixtures.js`, which keeps Supabase out; `test.use({ cloud: 'fake' })` swaps in
  `e2e/fake-supabase.js` (signed-in user, in-memory server). New behaviour gets a test; if `app.js`
  starts calling a new supabase-js method, add it to the fake.
- **Releases:** bump `CACHE` in `sw.js`, and add any new file the app loads to its `SHELL` list.
- **Text:** wrap it in `t("…")` (or `data-i18n` in `index.html`) and add the Turkish to `tr` in
  `i18n.js`. Plurals are pairs: `tPlural(n, "{count} kick", "{count} kicks")`.
- **Sync:** kicks are replaced, never mutated, when edited; a kick leaves the `unsynced` queue only
  once the server returns it. Sessions aren't stored: they're runs of kicks under 10 minutes apart.
- **Schema:** `supabase-schema.sql`, safe to re-run, RLS on every table. Supabase project ref
  `gcdzlkqjhguuuyaphjxh`.
- **Open work:** GitHub issues and the Kick Tracker project board.

## House rules

### Product

- **Works without an account.** The app runs local-only first (data in `localStorage`); accounts and
  sync through Supabase are an optional layer on top. Without the Supabase settings it still works.
- **Offline-first.** Each device keeps its own copy. Changes made offline are queued and sent when the
  connection is back, even after a reload. A service worker caches the app so it opens offline.
- **Installable PWA.** Web manifest, icons (192, 512, maskable 512, apple-touch), theme colour, and
  an SVG favicon.
- **English and Turkish from day one.** The English text is the translation key (`t('Add show')`);
  only Turkish needs a full dictionary. It follows the device language the first time, a toggle
  switches it, and the choice is kept per device. The toggle's label is written in the language it
  switches to ("Türkçe'ye geç" / "Switch to English"). A test fails when a key has no Turkish.
- **Light and dark theme**, with a toggle, kept per device and applied before first paint (a tiny
  inline/early script) so there is no flash.
- **Sign-in is a 6-digit code by email, not a link** (works in installed apps and on another device).
  The first sign-in creates the account; there is no separate sign-up. Google is an optional extra.
- The app's name lives in one place (`src/brand.ts` / one constant) and is used everywhere from there.

### Data and security

- Every Supabase table has row-level security on, with a policy limiting rows to their owner
  (or household). The anon/publishable key is public by design; RLS is what keeps data private.
- Secrets live in `.env.local` / `supabase/.env.local`, both gitignored. `.env.example` lists every
  variable with a comment saying where to get it and what happens without it.
- Schema changes are numbered migration files in the repo (`supabase/migrations/000N_<what>.sql`),
  never only clicked in the dashboard.
- Full profile: a Content-Security-Policy meta tag is added at build time, listing only the origins
  actually used.

### Code

- Small, focused files. Anything that talks to an outside service sits behind one module or interface
  (e.g. `CloudApi` with `supabaseCloud.ts` as its only Supabase code), so it can be faked in tests
  and swapped later.
- Comments explain *why*, in plain sentences. No comments that restate the code.
- No new dependency without a reason; prefer the platform. Pin CDN scripts to an exact version.

### Tests

- Every project has end-to-end tests with Playwright on a desktop and a phone, covering what a user
  does: the main actions, the language and theme toggles, opening offline. CI runs them on every push
  and pull request.
- Full profile adds unit and component tests with Vitest + Testing Library, and runs e2e against the
  production build.
- A bug fix comes with a test that would have caught it.
- Tests never touch real services: they use in-memory fakes (`FakeCloud`), and the test config blanks
  out every `VITE_*` variable even if `.env.local` exists.
- `npm run check` runs everything (lint, types, unit, e2e). It must pass before pushing to `main`.

### Git and GitHub

- `main` is what's live; work happens on `dev` (preview deploy). A pre-push hook runs `npm run check`
  on pushes to `main` (branch protection needs GitHub Pro on private repos).
- Commit messages are one plain sentence about what changed for the user, in present tense, no
  prefixes: "Parents can add a video link", "Fix flaky TV remote e2e: wait for the channel page".
  Releases: "Release: <comma-separated highlights>".
- Open work is tracked in GitHub issues (and a project board for bigger projects), not in TODO files.

### README

Written for a person, not a robot, in plain language:

1. What it is, in two or three sentences.
2. **Getting started**: the commands, plus a table of scripts and what each does.
3. **Deploying**: where it's hosted, the exact dashboard clicks, which variables go where and why.
4. One section per outside service (Supabase, email, CAPTCHA…), as numbered setup steps.
5. How the main parts fit together, and a short project-layout tree.

Keep it up to date in the same commit as the change it describes.
