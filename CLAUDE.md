# CLAUDE.md — Conto Spese

Personal expense ledger of the user (single user). Born from the Google Sheet "Budgeting 26". **Until the day the user says (31 Dec 2026 at the latest) the sheet is still the source of truth and the app is a test bench** with disposable test data. Then the test data is wiped (Configurazione → Dati → "Azzera i dati di prova") and the app starts from zero with no 2026 history; the sheet stays read-only as the 2026 archive. After that the app's ledger is the real ledger.

Product and plan: `docs/visione.md` and `docs/strategia-2027.md` (private), `CONTEXT.md` (vocabulary, use these terms in code), `docs/spec.md` (data model and rules), `docs/piano.md` (tasks and calendar).

## How to work here

- Reply to the user in Italian, in plain short sentences. Code comments, test names, commit messages: English. UI strings: Italian. Identifiers are a mix (many Italian names came from the first version: `calcola`, `movs`, `righe`); keep them, do not bulk-rename.
- Smallest correct change, no new dependency or build step unasked: the app is deliberately a static page. `shortcut:` comments mark known limits; keep that style.
- Every feature must work on both phone and PC (the user uses both equally).
- Commit and push only as step 5 and 6 of the workflow allow (user's decision, 2026-11-25), otherwise only when asked. **A push to `main` deploys the site.**
- Never print or commit the user's ledger data. `dati/` (git-ignored) holds the 2026 import file; the repo is public.

## Workflow (every change; user's decision, 2026-11-10)

1. **Discuss first.** Say in two or three lines what would change, whether it is in or out of scope of the request, and whether it touches the stored data format. Edit only after the user's go-ahead. **Exception, plan activities (step 6): no proposal, no waiting** (user's decision, 2026-11-25); the plan and `docs/spec.md` are the go-ahead. Ask only when the spec is silent or contradicts itself, or the change would alter the stored data format beyond what `docs/spec.md` defines.
2. **Logic is test-first.** Amounts, the budget rule and parsing: invoke the `mattpocock-skills:tdd` skill, write one failing test in `tests/`, see it fail, then the least code in `logic.js`. A logic bug starts with a test that reproduces it. No automated tests for UI. If the skill suggests something against this file (new dependency, real data in tests, browser automation), this file wins.
3. **Verify.** `node --test`, then the preview at phone and desktop width. List in chat what the user must try by hand (Google login, sync). For plan activities the list also goes in the priority's manual-test document (step 6).
4. **Review before any commit.**
   - `/code-review` on every diff; never `--fix` or `--comment` without asking.
   - `/security-review` only when login, Firestore writes or the import are touched.
   - Check the diff for real ledger data and for files under `dati/`: the repo is public.
   Fix real findings before proposing the commit.
5. **Commit and push.** Outside the plan activities (step 6): only when asked, and say before a push that it deploys the site.
6. **Activities of `docs/piano.md`.** One session per activity: do only that one, then stop (never start the next). At the end, automatically and in this order: run `node --test`; run step 4 (review and data check) on the diff and fix real findings; mark the row done in `docs/piano.md` (one line on what was done and any note for later activities); from activity 2.1 on, add this activity's manual tests to `docs/test-manuali/priorita-N.md` (see "Manual-test documents" below); commit only the files of this activity (English message, with the attribution line) and push to `main`; report in chat, saying that the push deployed the site. Stop and ask instead if tests fail, a review finding is not fixed, the diff holds real ledger data or a file under `dati/`, or the change touches login, Firestore writes or the import and `/security-review` finds something.

No backup is needed while the data is test data (decided 2026-11-22). After the start from zero, back up before any format change.

## Manual-test documents (user's decision, 2026-11-25; from priority 2)

One document per priority, `docs/test-manuali/priorita-N.md` (git-ignored: it holds screenshots and stays private). Italian, for the user to follow on phone and PC. Each plan activity adds its section as part of step 6; the last activity of the priority completes it and adds an opening checklist for the whole priority. Per test: what to do (numbered steps), what must happen, and a screenshot of the screen involved, saved in `docs/test-manuali/img/` and linked from the document. Screenshots come from the local preview with the fake Firebase and **invented data only**: never real ledger data, never the user's account. Say what could not be shown (Google login, real sync). The orchestrating chat does not rewrite the document; it reads it and reports it to the user when the priority closes.

Deliberately not used here: branches and PRs, browser automation (Playwright), CI test runs (they would not block the Pages deploy).

## What it is

Static web app hosted on GitHub Pages from `main`: https://misterweeman.github.io/conto-spese/

- `index.html`: CSS, markup and one `<script type="module">` (UI, Firebase from the gstatic CDN). Login gate until a Google sign-in exists.
- `logic.js`: pure logic (`parseAmount`, `movs`, `net`, `calcola`), no DOM or Firestore. Exposes `window.CSLogic` in the page, `module.exports` in the tests. New pure logic goes here, with a test.
- `tests/logic.test.js`: `node --test`, no dependency, made-up data only. Run it before saying a change is done and before any push.
- `.claude/` (git-ignored): `serve.mjs` + `launch.json`, local preview on http://localhost:8124.

## Data (Firestore)

The format below is the **current** one. `docs/spec.md` defines the new one (monthly budgets, savings pots, one-row transfers, Joint share, credits, labels); it replaces the old in the same collections.

Same Firebase project as `one-piece-collection-tracker` (`one-piece-tracker-c7b87`), user's choice. The web config in `index.html` is public by design. Rules live only in the Firebase console: `match /users/{uid}/{document=**}` allows read/write to the signed-in owner. Ask the user before assuming they changed.

- `users/<uid>/spese_mesi/<YYYY-MM>` = `{mov: {<id>: {d: 'YYYY-MM-DD', n: note, e: income, u: expense, c: category, k: account, x: 1 if deleted}}}`. Writes use `setDoc(..., {merge: true})` on a single movement; the app always writes every field (a missing field would keep the old value). Delete = tombstone `x: 1`. Imported ids `i00000`…, app ids `m<base36 time><rand>`.
- `users/<uid>/spese_config/main` = `{budget: {category: annual euro}, categorie: [...], conti: [...]}`. Old `gruppi` and `colori` fields may still be stored: the app ignores them.
- Until the start from zero the stored data is disposable test data: no backup, no care for old data. Never run "Azzera i dati di prova" unless the user says so (2026 history is NOT imported, decided 2026-11-26; see `docs/spec.md` "Avvio senza storico"). After it the data is the real ledger: back up before any later format change.
- Offline: Firestore persistent cache; writes are not awaited on purpose (they settle only when the network is back).

## Budget rule (OLD, from the sheet; replaced by `docs/spec.md`)

The new rule has no carry-over: budgets are monthly and reset every month. Old rule: residual of a category in month M = annual budget / 12 × M + net of the category from January to M (same year). Unspent or overspent amounts carry over within the year. Movements without category are transfers between accounts and stay out of every total.

## Git

- Remote: https://github.com/MisterWeeMan/conto-spese (public, required by free GitHub Pages). Only `main`, no branches, no PRs.
- Two GitHub accounts are logged in on this PC; this repo uses the personal one, `MisterWeeMan`. Do not switch the active account (the work one is needed elsewhere): prefix commands with `GH_TOKEN=$(gh auth token --user MisterWeeMan)`. Local git identity and the `gh` credential helper are set in this repo only.

## Testing notes

- Google login needs the user's account: Claude cannot test it. The user confirmed on 2026-11-10 that the Google login works on mobile.
- After a UI change, check the page at phone and desktop width and say what the user should try by hand.

## Agent skills

### Issue tracker

GitHub Issues via `gh` (with the `MisterWeeMan` token prefix). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
