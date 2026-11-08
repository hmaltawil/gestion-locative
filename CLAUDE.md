# CLAUDE.md: notes for whoever works on this project next

## What this is

**Gestion locative** is an offline web app (PWA) that a private landlord in France uses on an iPhone to manage about 15 **unfurnished** rentals (location nue, régime réel, form 2044). It replaces a paid app, Gestion Locative Facile (made by Immobilier Loyer).

- **Live:** https://hmaltawil.github.io/gestion-locative/. GitHub Pages deploys from `main`, folder `/`, a few minutes after each push.
- **People:** the repository owner (GitHub `hmaltawil`) sets the app up and supports it. The day-to-day user is **another person**, who installs the app on their own iPhone and enters their own data from scratch: no handover from the owner's phone and no import from the old app (decided 7 Nov 2026). Their phone is the main phone of its own private GitHub backup repository; the owner's device is at most a support copy. The owner talks to Claude in English and wants plain explanations, not jargon.
- **Language:** screens are in French or English (Settings). PDF documents are **always in French**, because they are legal documents.
- **Status, what's next, and why:** see `ROADMAP.md`. It is the source of truth: read it first and update it at the end of every milestone.

## How we work (agreed with the owner)

1. **One milestone at a time.** Agree the list before starting. New ideas go to the roadmap's Ideas section, not into the current milestone.
2. **A milestone is done when:** `npm test` passes; the browser tests pass (`npm run serve`, then `npm run e2e` in another shell); `VERSION` in `sw.js`, `APP_VERSION` in `js/app.js` and `version` in `package.json` are bumped; README and ROADMAP are updated; it is pushed to `main` and the live `sw.js` shows the new version; the owner has checked it on the iPhone.
3. **Bugs found on the iPhone** go to the top of the next milestone.
4. **Privacy:** this repository is **public**. Never commit real tenant data, and never ask the owner to paste it. Work from format samples with names replaced. The bank import runs on the phone with the real files.

## Architecture

- **Static site, no build step:** `index.html`, `css/app.css`, ES modules in `js/`, `vendor/jspdf.umd.min.js` (jsPDF 4.2.1, MIT). Nothing to compile; edit and push.
- **Offline:** `sw.js` caches every file listed in `FILES`, cache first. A new file must be added to `FILES`, and `VERSION` must change, or phones keep the old code. Installs fetch with `cache: 'reload'` so a new version never stores stale files. The app shows a "new version" bar and reloads only when the user taps it.
- **Storage (IndexedDB `gestion-locative`, schema version 3):**
  - `kv`: key `state` holds all the app data as one JSON object; key `secrets` holds the GitHub backup settings (including this phone's `device` tag), kept out of `state` so they never end up in backups or snapshots.
  - `files`: attached documents, as `{ name, type, data: ArrayBuffer }`.
  - `snapshots`: automatic copies, as `{ id, at, day, reason, counts, state }`.
- **Rendering:** `js/app.js` builds HTML strings per route (`location.hash`, for example `#/lease/<id>`). Events are delegated through `data-action`, `data-form` and `data-change` attributes, dispatched to the `actions`, `forms` and `changes` objects. Later features add to these with `Object.assign(actions, {...})`. Every data change goes through `commit(fn)`, which saves, re-renders and calls `afterChange()` (backup scheduling and the daily snapshot).
- **Security rule:** `index.html` has a Content-Security-Policy: scripts only from the app (plus the inline theme script, allowed by its sha256), network only to `api.github.com` and `bdm.insee.fr`. A test checks the hash; update it if you change the theme script. A new outside service must be added to `connect-src`.
- **Checks before saving:** form handlers call `passes(checkX(...))` from `js/checks.js` before `commit()`. Add new plausibility or legal checks there, with a test and both `chk_` messages.
- **Values from the address bar** (`r.query`, `r.id`) are checked against real ids, years and months before use, and escaped like any other text.
- **Share menu results:** `shareFile()` returns `shared`, `cancelled`, `downloaded` (no share menu) or `fallback` (the share menu failed; the file was offered as a download). Only `shared` and `downloaded` count as sent or saved (`delivered()` in `app.js`).
- **Lists that line up:** a list whose rows have a status column and an action column uses `<ul class="list cols">`, with exactly three cells per `li.row` (main, status, action; put an empty `<span>` when a row has no action). CSS subgrid then gives every row the same columns, whatever the language.

### Files
| File | What it does |
|---|---|
| `js/app.js` | All screens, sheets, actions, the boot sequence, the service-worker update bar, the theme |
| `js/calc.js` | **Money logic (pure):** rent due, pro rata, `ledger()` with oldest-debt-first allocation (including one-off adjustments), late amounts, IRL revision status, `rentCallBalance()` (the one source for every rent call), payment frequency (`billingPeriod()`, `periodDue()`, `periodReceipt()`, `dueInMonth()`) |
| `js/charges.js` | Charges reconciliation (and `undoRegRent()` when one is undone), deposit return statement and `depositSettlement()` (what is booked when the deposit goes back), lease term and notice dates, leases overlapping on one property |
| `js/tax.js` | Form 2044 summary (cash basis, rent excluding charges), CSV export |
| `js/deadlines.js` | Deadline list and the `.ics` calendar file |
| `js/checks.js` | **Checks on what is typed in (pure):** likely mistakes (the app asks) and legal limits (it refuses), returned as `{ error, warnings }` with i18n keys `chk_<key>`; `passes()` in `app.js` shows them |
| `js/bank.js` | Bank CSV parsing (delimiter, header, French dates and amounts, Revolut format), lease matching, and likely duplicates of payments typed in by hand |
| `js/docs.js` | All PDFs, built with jsPDF. Every string goes through `pdfText()` (`util.js`) |
| `js/irl.js` | Built-in INSEE IRL table plus live update (`bdm.insee.fr` allows browser requests) |
| `js/store.js` | IndexedDB, backup file, restore, `normalize()` (migrates old data and cleans everything read back: ids, dates, months and the signature must match what the app writes; extend it whenever the data model changes) |
| `js/snapshots.js` | Snapshot rules: 14 daily, 10 event snapshots, 15-day document trash |
| `js/crypto.js` | AES-256-GCM, with the key derived from the passphrase by PBKDF2-SHA-256 (600,000 iterations for new files; files say their own count, accepted between 100,000 and 2,000,000), via Web Crypto |
| `js/sync.js` | GitHub REST API (contents, commits) for the encrypted backup; refuses to replace a version saved by another device |
| `js/support.js` | Anonymised support file |
| `js/i18n.js` | All interface text, `fr` and `en` (both must have the same keys; a test checks this) |
| `js/util.js` | Dates, money, French amounts in words |

### Data conventions
- **Money:** integer **cents** everywhere. On screen, `tabular-nums` (equal-width digits) only for amounts stacked in a column; a single big amount uses normal digits. `fmtMoney` formats with plain spaces, never non-breaking ones, so PDFs render correctly. `parseMoney` accepts French input; a lone `.` or `,` followed by exactly three digits is a thousands separator ("1.200" = 1 200 €). Rent revisions round **down** (the law sets a maximum).
- **Dates:** strings `YYYY-MM-DD`; rent periods are `YYYY-MM`. Avoid `Date` objects for calendar logic, because of time zones.
- **Leases:** `rents[]` holds `{ from: 'YYYY-MM', rent, charges, reason }` entries, sorted by `from`. The lease edit form corrects the entry in force today (`rentEntryToCorrect()`, `correctRent()`); "Change rent" adds a new entry from a given month. `trackFrom` and `openingBalance` let leases already running start tracking mid-way. `adjustments[]` holds one-off charges (positive) and credits (negative). `irl` is `{ quarter, key: 'YYYY-Qn', value }`. Also `revisionDate` (MM-DD), `lastRevision`, `insuranceUntil`, `regularizations{year}` (each `{ date, balance, actual, provisions, tenantShare, rentChange }`; `rentChange` lets an undo take back the new monthly charges and restore the entry it replaced) and `departure{}` (`keysDate`, `inventoryMatches`, `deductions`, `retention`, `newAddress`; once returned, `returnedOn`, `returnedAmount` and the frozen `statement`).
- **Payment frequency** (1.3.11): `frequency` (1, 3 or 6 months; absent = 1), `payTiming` (`advance` = at the start of each period, default; `arrears` = at its end) and `periodAnchor` (`YYYY-MM`, the month periods start from; default the lease's first month). Rent stays monthly in the ledger; every month of a period gets the period's payment date (`dueDateFor()`), and receipts, rent calls and the monthly send work per period (`periodReceipt()`, `periodDue()`). Use `frequencyOf()`/`timingOf()`, never the raw fields.
- **Payments** are not tied to a month. `ledger()` allocates them oldest debt first, and records `allocations` per debt, which `tax.js` uses to count rent on the date received. Each allocation has a `source` (`tenant`, `caf` for payments with `method: 'caf'`, `deposit`, `credit`, `opening`); `receivedFor()` groups them for the receipts' "who paid" table. An allocation from a charges-reconciliation refund carries `charges: true`: tax counts it as rent received and as negative charges, so a charges refund never lowers line 211. Payments with `method: 'deposit'` are the deposit applied to the account at a departure (not new money).
- **Deposit return:** `depositSettlement()` books the deductions, applies the deposit (less the 20% held back) as a payment, and books what is actually sent back (less the penalty) as a `refund` adjustment, so the account ends at zero, at what is still owed, or shows the difference when another amount was sent (the app asks first, `checkDepositReturned`). The late penalty is not booked: it is the landlord's cost. The lease's `endDate` is the end of the notice (rent stops there, article 15); `departure.keysDate` starts the deposit deadline; the departure screen keeps them apart.
- **Tax figures entered by hand:** `tax: { 'YYYY': { line230 } }` (line 230 is subtracted from the costs).
- **`sent`:** `{ 'receipt:<leaseId>:<YYYY-MM>': date, 'rentCall:…': date, 'reminder:<leaseId>': date }`; the formal notice checks for a reminder since the oldest late amount fell due.

## French rules encoded (check with the owner and a professional before changing)
- **Rent revision:** limited to the one-year change of the IRL for the quarter named in the lease (art. 17-1, law of 6 July 1989), rounded down to the cent. Not backdated, and must be claimed within a year. No increase for properties rated F or G (DPE).
- **Homes that can no longer be let** (law Climat et résilience, metropolitan France): rated G from 1 Jan 2025, F from 2028, E from 2034 (`DPE_BAN` in `checks.js`). A new lease asks first; the property page says so.
- **Receipts:** a full receipt (quittance) only for a fully paid period; a partial payment gets a "reçu" (art. 21). Free of charge. When the CAF pays the housing benefit to the landlord, the receipt names it and shows its amount apart from the tenant's.
- **Charges reconciliation:** statement by type of charge, receipts available for 6 months (art. 23); split by days of occupancy. Done after the end of the following year, the tenant may pay the balance in 12 monthly instalments (art. 23): the letter and the screen say so. Fixed charges (forfait) are only allowed in a flat-share (art. 8-1): choosing them asks first, and the tax summary shows fixed charges received apart.
- **Deposit:** returned within 1 month of the keys if the move-out inspection matches move-in, otherwise 2 months. Penalty of 10% of the monthly rent excluding charges per started month late. Up to 20% may be held back for buildings with shared accounts (art. 22). Rent is due until the end of the notice even if the keys come back earlier (art. 15).
- **Unfurnished lease:** 3-year terms; the landlord's notice must reach the tenant at least 6 months before the term ends. Rent may be paid every 3 or 6 months if the lease says so, but the tenant can always ask to pay monthly (art. 7).
- **Form 2044 lines used:** 211, 221 to 229, 240, 250. A €20 flat fee per property goes on line 222. Micro-foncier is possible up to €15,000 of gross rent. The tax summary is labelled as a guide.
- **Guarantor agreement:** the art. 22-1 paragraph is reproduced, and the guarantor writes the required statement by hand. A legal check of this template and the formal notice is pending with the ADIL.

## Testing
- `npm test`: Node's test runner on `tests/*.test.mjs` (calculations, bank, charges, tax, deadlines, crypto, snapshots, sync against a fake GitHub, anonymisation, i18n, input checks, the security rule and the cleaning of crafted files; `fixes.test.mjs` holds the 1.3.9 review fixes, including a check that every app file is listed in `sw.js`; `frequency.test.mjs` the payment frequency). `tests/e2e/frequency.cjs` switches a lease to quarterly and checks the receipt PDF.
- `npm run serve` (port 8080), then `npm run e2e`: Playwright scripts in `tests/e2e/*.cjs`, against a 390×844 window. Playwright and Chromium are preinstalled in Claude's cloud environment. `backup.cjs`, `support.cjs` and `security.cjs` mock `api.github.com` with `context.route`. `security.cjs` restores a crafted backup through the real Restore button and checks that nothing runs.
- `tests/e2e/upgrade.cjs <dir>` tests updating from an older version. It needs a `git worktree` of the old commit in `<dir>/old`; run `touch sw.js` afterwards (see the gotchas).
- Look at screenshots and at PDFs (`pdftoppm -png`) after visual changes.

## Gotchas learned the hard way
- **The file-writing tool once turned `\uXXXX` escapes into invisible literal characters.** After writing JS, scan for code points in the Unicode categories `Cf`, `Mn`, `Zs` or `Cc` and replace them with escapes.
- **On iOS, `navigator.share` must happen right after the tap.** Long `await`s before it lose the permission. That's why the backup file is prepared in advance, and why the `.ics` file is put in Cache Storage under `./export/` and opened as a link (the iPhone share menu has no Calendar option).
- **Local test server:** Python's `http.server` answers 304 when the file's modified time is not newer than the browser's copy. In upgrade tests, `touch sw.js` after creating the old worktree.
- **Playwright:** full-page screenshots hang with `devices['iPhone …']` emulation (`isMobile`), so use a plain viewport. Full-page shots also show the sticky header in the middle and sheets mid-animation; that's not a bug.
- **From Claude sessions:** pushing git tags is refused, and so is pushing `.claude/` files. The owner adds `.claude/settings.json` themselves if they want fewer prompts. Enabling GitHub Pages through the API is also refused.
- **iOS storage:** the home-screen app and Safari have separate storage, and deleting the icon erases the data. Hence the three layers: snapshots, the encrypted GitHub backup and the manual backup file.
- **Backups:** only one "main phone" should be connected to the backup repository. Each phone adds its `[device]` tag to its commit messages; when GitHub says the file changed (409/422), a phone replaces it only if the latest commit carries its own tag (its previous answer was lost), otherwise it stops with error `conflict` and offers "Restore" or "Save this phone's data anyway" (`syncForce`). It also stops with error `shrink` when the data has lost more than half of the leases, properties or payments since the last upload (`meta.lastCounts`). Use "support copy" mode to look at the user's data.
- **Pushing to `main` deploys the live app.** Claude sessions work on their `claude/…` branch and fast-forward `main` only after the owner says so in the conversation (the session's permission check refuses it otherwise). Adding another repository to a session can be refused too.
- **`periodReceipt()` looks ahead** (the ledger up to the end of the period, so an advance for the whole period counts). The `late` and `status` flags of its rows are computed for that later date: work out lateness from `dueDate` against today instead.
- **`normalize()` never adds default fields** (a test checks that cleaning keeps what the app wrote unchanged): an absent field means the default, read through helpers such as `frequencyOf()`.
- **Same web address as the owner's Deutschlernen site** (`hmaltawil.github.io`), so a browser that opens both shares this app's storage. The user's iPhone never opens it and the home-screen app has its own storage; the owner opens the support copy only from its home-screen icon.
- **PDF fonts:** jsPDF's built-in Helvetica only has Windows-1252 letters. `pdfText()` (wrapped around `doc.text` and `doc.splitTextToSize` in `newDoc()`) simplifies other letters (Łukasz → Lukasz) instead of printing garbage. A full Unicode font is in the roadmap's Ideas.

## Current state (8 Nov 2026)
- **Done and checked on the iPhone:** versions 1.0 to 1.3.12 (the roadmap's Done table). Recent: 1.3.9 (second code review), 1.3.10 (Settings › Setup and support: steps to set up the user's iPhone from scratch, `setup1`…`setup8` in `i18n.js`), 1.3.11 (rent paid every 1, 3 or 6 months, in advance or in arrears; receipts and rent calls per period). 1.3.12 (8 Nov 2026) only removed unused code.
- **In use:** the user's iPhone holds their own data and backs up to its own private GitHub repository (connected 7 Nov 2026). The owner's old test repository `locatif-sauvegarde` and its token were deleted on 8 Nov 2026.
- **Next:** milestone 7, fixes from real use, as they come up. Milestone 6 (bank import tuned to CIC and Crédit Agricole) is on hold; milestone 5 (import from Gestion Locative Facile) was dropped.
- **Open items** (the roadmap's first section): the ADIL legal check (guarantor statement under article 2297, which IRL value applies to a late revision, the late-deposit penalty); the owner's phone to connect as a support copy when needed (it is disconnected); the user's running leases need their start of tracking set to January 2026 for a complete tax summary. Decided on 7 Nov 2026: the app keeps its `hmaltawil.github.io` address (see the gotcha about Deutschlernen).
