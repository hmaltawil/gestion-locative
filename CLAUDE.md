# CLAUDE.md: notes for whoever works on this project next

## What this is

**Gestion locative** is an offline web app (PWA) that a private landlord in France uses on an iPhone to manage about 15 **unfurnished** rentals (location nue, régime réel, form 2044). It replaces a paid app, Gestion Locative Facile (made by Immobilier Loyer).

- **Live:** https://hmaltawil.github.io/gestion-locative/. GitHub Pages deploys from `main`, folder `/`, a few minutes after each push.
- **People:** the repository owner (GitHub `hmaltawil`) sets the app up and supports it. The day-to-day user is **another person**, who will get the app through the handover flow in Settings. The owner talks to Claude in English and wants plain explanations, not jargon.
- **Language:** screens are in French or English (Settings). PDF documents are **always in French**, because they are legal documents.
- **Status, what's next, and why:** see `ROADMAP.md`. It is the source of truth: read it first and update it at the end of every milestone.

## How we work (agreed with the owner)

1. **One milestone at a time.** Agree the list before starting. New ideas go to the roadmap's Ideas section, not into the current milestone.
2. **A milestone is done when:** `npm test` passes; the browser tests pass (`npm run serve`, then `npm run e2e` in another shell); `VERSION` in `sw.js`, `APP_VERSION` in `js/app.js` and `version` in `package.json` are bumped; README and ROADMAP are updated; it is pushed to `main` and the live `sw.js` shows the new version; the owner has checked it on the iPhone.
3. **Bugs found on the iPhone** go to the top of the next milestone.
4. **Privacy:** this repository is **public**. Never commit real tenant data, and never ask the owner to paste it. Work from format samples with names replaced. The bank and Gestion Locative Facile imports run on the phone with the real files.

## Architecture

- **Static site, no build step:** `index.html`, `css/app.css`, ES modules in `js/`, `vendor/jspdf.umd.min.js` (jsPDF 4.2.1, MIT). Nothing to compile; edit and push.
- **Offline:** `sw.js` caches every file listed in `FILES`, cache first. A new file must be added to `FILES`, and `VERSION` must change, or phones keep the old code. Installs fetch with `cache: 'reload'` so a new version never stores stale files. The app shows a "new version" bar and reloads only when the user taps it.
- **Storage (IndexedDB `gestion-locative`, schema version 3):**
  - `kv`: key `state` holds all the app data as one JSON object; key `secrets` holds the GitHub backup settings (including this phone's `device` tag), kept out of `state` so they never end up in backups or snapshots.
  - `files`: attached documents, as `{ name, type, data: ArrayBuffer }`.
  - `snapshots`: automatic copies, as `{ id, at, day, reason, counts, state }`.
- **Rendering:** `js/app.js` builds HTML strings per route (`location.hash`, for example `#/lease/<id>`). Events are delegated through `data-action`, `data-form` and `data-change` attributes, dispatched to the `actions`, `forms` and `changes` objects. Later features add to these with `Object.assign(actions, {...})`. Every data change goes through `commit(fn)`, which saves, re-renders and calls `afterChange()` (backup scheduling and the daily snapshot).
- **Lists that line up:** a list whose rows have a status column and an action column uses `<ul class="list cols">`, with exactly three cells per `li.row` (main, status, action; put an empty `<span>` when a row has no action). CSS subgrid then gives every row the same columns, whatever the language.

### Files
| File | What it does |
|---|---|
| `js/app.js` | All screens, sheets, actions, the boot sequence, the service-worker update bar, the theme |
| `js/calc.js` | **Money logic (pure):** rent due, pro rata, `ledger()` with oldest-debt-first allocation (including one-off adjustments), late amounts, IRL revision status, `rentCallBalance()` (the one source for every rent call) |
| `js/charges.js` | Charges reconciliation, deposit return statement and `depositSettlement()` (what is booked when the deposit goes back), lease term and notice dates, leases overlapping on one property |
| `js/tax.js` | Form 2044 summary (cash basis, rent excluding charges), CSV export |
| `js/deadlines.js` | Deadline list and the `.ics` calendar file |
| `js/bank.js` | Bank CSV parsing (delimiter, header, French dates and amounts, Revolut format), lease matching, and likely duplicates of payments typed in by hand |
| `js/docs.js` | All PDFs, built with jsPDF. Every string goes through `pdfText()` (`util.js`) |
| `js/irl.js` | Built-in INSEE IRL table plus live update (`bdm.insee.fr` allows browser requests) |
| `js/store.js` | IndexedDB, backup file, restore, `normalize()` (migrates old data; extend it whenever the data model changes) |
| `js/snapshots.js` | Snapshot rules: 14 daily, 10 event snapshots, 15-day document trash |
| `js/crypto.js` | AES-256-GCM, with the key derived from the passphrase by PBKDF2-SHA-256 (310,000 iterations), via Web Crypto |
| `js/sync.js` | GitHub REST API (contents, commits) for the encrypted backup; refuses to replace a version saved by another device |
| `js/support.js` | Anonymised support file |
| `js/i18n.js` | All interface text, `fr` and `en` (both must have the same keys; a test checks this) |
| `js/util.js` | Dates, money, French amounts in words |

### Data conventions
- **Money:** integer **cents** everywhere. `fmtMoney` formats with plain spaces, never non-breaking ones, so PDFs render correctly. `parseMoney` accepts French input.
- **Dates:** strings `YYYY-MM-DD`; rent periods are `YYYY-MM`. Avoid `Date` objects for calendar logic, because of time zones.
- **Leases:** `rents[]` holds `{ from: 'YYYY-MM', rent, charges, reason }` entries, sorted by `from`. `trackFrom` and `openingBalance` let leases already running start tracking mid-way. `adjustments[]` holds one-off charges (positive) and credits (negative). `irl` is `{ quarter, key: 'YYYY-Qn', value }`. Also `revisionDate` (MM-DD), `lastRevision`, `insuranceUntil`, `regularizations{year}` and `departure{}`.
- **Payments** are not tied to a month. `ledger()` allocates them oldest debt first, and records `allocations` per debt, which `tax.js` uses to count rent on the date received. An allocation from a charges-reconciliation refund carries `charges: true`: tax counts it as rent received and as negative charges, so a charges refund never lowers line 211. Payments with `method: 'deposit'` are the deposit applied to the account at a departure (not new money).
- **Deposit return:** `depositSettlement()` books the deductions, applies the deposit (less the 20% held back) as a payment, and books what is sent back as a `refund` adjustment, so the account ends at zero or at what is still owed. The late penalty is not booked: it is the landlord's cost.
- **Tax figures entered by hand:** `tax: { 'YYYY': { line230 } }` (line 230 is subtracted from the costs).

## French rules encoded (check with the owner and a professional before changing)
- **Rent revision:** limited to the one-year change of the IRL for the quarter named in the lease (art. 17-1, law of 6 July 1989). Not backdated, and must be claimed within a year. No increase for properties rated F or G (DPE).
- **Receipts:** a full receipt (quittance) only for a fully paid period; a partial payment gets a "reçu" (art. 21). Free of charge.
- **Charges reconciliation:** statement by type of charge, receipts available for 6 months (art. 23); split by days of occupancy.
- **Deposit:** returned within 1 month if the move-out inspection matches move-in, otherwise 2 months. Penalty of 10% of the monthly rent excluding charges per started month late. Up to 20% may be held back for buildings with shared accounts (art. 22).
- **Unfurnished lease:** 3-year terms; the landlord's notice must reach the tenant at least 6 months before the term ends.
- **Form 2044 lines used:** 211, 221 to 229, 240, 250. A €20 flat fee per property goes on line 222. Micro-foncier is possible up to €15,000 of gross rent. The tax summary is labelled as a guide.
- **Guarantor agreement:** the art. 22-1 paragraph is reproduced, and the guarantor writes the required statement by hand. A legal check of this template and the formal notice is pending with the ADIL.

## Testing
- `npm test`: Node's test runner on `tests/*.test.mjs` (calculations, bank, charges, tax, deadlines, crypto, snapshots, sync against a fake GitHub, anonymisation, i18n).
- `npm run serve` (port 8080), then `npm run e2e`: Playwright scripts in `tests/e2e/*.cjs`, against a 390×844 window. Playwright and Chromium are preinstalled in Claude's cloud environment. `backup.cjs` and `support.cjs` mock `api.github.com` with `context.route`.
- `tests/e2e/upgrade.cjs <dir>` tests updating from an older version. It needs a `git worktree` of the old commit in `<dir>/old`; run `touch sw.js` afterwards (see the gotchas).
- Look at screenshots and at PDFs (`pdftoppm -png`) after visual changes.

## Gotchas learned the hard way
- **The file-writing tool once turned `\uXXXX` escapes into invisible literal characters.** After writing JS, scan for code points in the Unicode categories `Cf`, `Mn`, `Zs` or `Cc` and replace them with escapes.
- **On iOS, `navigator.share` must happen right after the tap.** Long `await`s before it lose the permission. That's why the backup file is prepared in advance, and why the `.ics` file is put in Cache Storage under `./export/` and opened as a link (the iPhone share menu has no Calendar option).
- **Local test server:** Python's `http.server` answers 304 when the file's modified time is not newer than the browser's copy. In upgrade tests, `touch sw.js` after creating the old worktree.
- **Playwright:** full-page screenshots hang with `devices['iPhone …']` emulation (`isMobile`), so use a plain viewport. Full-page shots also show the sticky header in the middle and sheets mid-animation; that's not a bug.
- **From Claude sessions:** pushing git tags is refused, and so is pushing `.claude/` files. The owner adds `.claude/settings.json` themselves if they want fewer prompts. Enabling GitHub Pages through the API is also refused.
- **iOS storage:** the home-screen app and Safari have separate storage, and deleting the icon erases the data. Hence the three layers: snapshots, the encrypted GitHub backup and the manual backup file.
- **Backups:** only one "main phone" should be connected to the backup repository. Each phone adds its `[device]` tag to its commit messages; when GitHub says the file changed (409/422), a phone replaces it only if the latest commit carries its own tag (its previous answer was lost), otherwise it stops with error `conflict` and offers "Restore" or "Save this phone's data anyway" (`syncForce`). Use "support copy" mode to look at the user's data.
- **PDF fonts:** jsPDF's built-in Helvetica only has Windows-1252 letters. `pdfText()` (wrapped around `doc.text` and `doc.splitTextToSize` in `newDoc()`) simplifies other letters (Łukasz → Lukasz) instead of printing garbage. A full Unicode font is in the roadmap's Ideas.

## Current state (6 Nov 2026)
- **Done:** milestones 1 to 4 (version 1.3.0, the owner's iPhone check passed) version 1.3.1, fixes from a code review (iPhone check passed too), and version 1.3.2, screen polish (iPhone check pending). The GitHub backup is set up to the private repository `locatif-sauvegarde`.
- **Next:** milestone 5, the import from Gestion Locative Facile. The owner will send the CSV export files from immobilierloyer.com, format only with names replaced. Build a review screen and a snapshot before importing, and bring in at least the 2025 and 2026 payment and rent history (see the roadmap).
- **Waiting:** a bank CSV sample (milestone 6), and the legal check by the ADIL (three letters, plus the questions listed in the roadmap: guarantor statement under article 2297, which IRL value applies to a late revision, the late-deposit penalty).
