# CLAUDE.md — Conto Spese

Personal expense ledger of the user (single user). Born from the Google Sheet "Budgeting 26"; the sheet is no longer the source of truth.

## How to work here

- Reply to the user in Italian, in plain short sentences. Code comments, test names, commit messages: English. UI strings: Italian. Identifiers are a mix (many Italian names came from the first version: `calcola`, `movs`, `righe`); keep them, do not bulk-rename.
- Smallest correct change, no new dependency or build step unasked: the app is deliberately a static page. `shortcut:` comments mark known limits; keep that style.
- Every feature must work on both phone and PC (the user uses both equally).
- Never commit or push unless asked. **A push to `main` deploys the site.**
- Never print or commit the user's ledger data. `dati/` (git-ignored) holds the 2026 import file; the repo is public.

## Workflow (every change; user's decision, 2026-11-10)

1. **Discuss first.** Say in two or three lines what would change, whether it is in or out of scope of the request, and whether it touches the stored data format. Edit only after the user's go-ahead.
2. **Logic is test-first.** Amounts, the budget rule and parsing: invoke the `mattpocock-skills:tdd` skill, write one failing test in `tests/`, see it fail, then the least code in `logic.js`. A logic bug starts with a test that reproduces it. No automated tests for UI. If the skill suggests something against this file (new dependency, real data in tests, browser automation), this file wins.
3. **Verify.** `node --test`, then the preview at phone and desktop width. List in chat what the user must try by hand (Google login, sync); no separate document.
4. **Review before any commit.**
   - `/code-review` on every diff; never `--fix` or `--comment` without asking.
   - `/security-review` only when login, Firestore writes or the import are touched.
   - Check the diff for real ledger data and for files under `dati/`: the repo is public.
   Fix real findings before proposing the commit.
5. **Commit and push only when asked.** Before a push, say that it deploys the site.

Before a migration of the stored format, back up the Firestore data first. How to do the backup is not decided yet: discuss it with the user when the first migration comes up.

Deliberately not used here: branches and PRs, manual-check documents, browser automation (Playwright), CI test runs (they would not block the Pages deploy).

## What it is

Static web app hosted on GitHub Pages from `main`: https://misterweeman.github.io/conto-spese/

- `index.html`: CSS, markup and one `<script type="module">` (UI, Firebase from the gstatic CDN). Login gate until a Google sign-in exists.
- `logic.js`: pure logic (`parseAmount`, `movs`, `net`, `calcola`), no DOM or Firestore. Exposes `window.CSLogic` in the page, `module.exports` in the tests. New pure logic goes here, with a test.
- `tests/logic.test.js`: `node --test`, no dependency, made-up data only. Run it before saying a change is done and before any push.
- `.claude/` (git-ignored): `serve.mjs` + `launch.json`, local preview on http://localhost:8124.

## Data (Firestore)

Same Firebase project as `one-piece-collection-tracker` (`one-piece-tracker-c7b87`), user's choice. The web config in `index.html` is public by design. Rules live only in the Firebase console: `match /users/{uid}/{document=**}` allows read/write to the signed-in owner. Ask the user before assuming they changed.

- `users/<uid>/spese_mesi/<YYYY-MM>` = `{mov: {<id>: {d: 'YYYY-MM-DD', n: note, e: income, u: expense, c: category, k: account, x: 1 if deleted}}}`. Writes use `setDoc(..., {merge: true})` on a single movement; the app always writes every field (a missing field would keep the old value). Delete = tombstone `x: 1`. Imported ids `i00000`…, app ids `m<base36 time><rand>`.
- `users/<uid>/spese_config/main` = `{budget: {category: annual euro}, categorie: [...], conti: [...]}`. Old `gruppi` and `colori` fields may still be stored: the app ignores them.
- Never change this stored format without discussing a migration first: it is the user's real ledger.
- Offline: Firestore persistent cache; writes are not awaited on purpose (they settle only when the network is back).

## Budget rule (from the sheet)

Residual of a category in month M = annual budget / 12 × M + net of the category from January to M (same year). Unspent or overspent amounts carry over within the year. Movements without category are transfers between accounts and stay out of every total.

## Git

- Remote: https://github.com/MisterWeeMan/conto-spese (public, required by free GitHub Pages). Only `main`, no branches, no PRs.
- Two GitHub accounts are logged in on this PC; this repo uses the personal one, `MisterWeeMan`. Do not switch the active account (the work one is needed elsewhere): prefix commands with `GH_TOKEN=$(gh auth token --user MisterWeeMan)`. Local git identity and the `gh` credential helper are set in this repo only.

## Testing notes

- Google login needs the user's account: Claude cannot test it. The user confirmed on 2026-11-10 that the Google login works on mobile.
- After a UI change, check the page at phone and desktop width and say what the user should try by hand.
