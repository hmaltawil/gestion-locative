# Roadmap

One place to see what's open, what's next and what's done. Update it at the end of each milestone.

**Status:** ✅ done · 🔜 next · ⏳ open · ⏸️ on hold · ❌ dropped · 💡 idea, not planned yet

**Where we are (9 Nov 2026):** version 1.3.12 is live and checked on the iPhone. Version 1.3.13 (two money fixes from the third code review) is ready on the branch `claude/intelligent-clarke-6p3lga`: it goes live when you say so, then needs your check on the iPhone. The user runs the app on their own iPhone, enters their own data, and backs up to their own private GitHub repository. **Next:** milestone 7, fixes from real use, as they come up. What's still open is listed just below.

## Open items

**Waiting on someone else**
- ⏳ **Legal check by the ADIL**, done once: the guarantor agreement, the formal notice and the deposit return letter, plus three questions:
  - Guarantor agreement: since 2022 (article 2297 of the Civil Code), is the handwritten statement complete (amount in figures and in words; for a joint guarantee, the acknowledgment that the landlord need not pursue the tenant first)?
  - Rent revision claimed late: which IRL value applies, the latest published on the anniversary date or the latest published on the day of the request? Today the app uses the latest available on the day you tap. Once answered, the app can follow the rule.
  - Deposit returned late: the app adds the penalty (10% of the rent per started month) and notes that it is not due if the tenant gave no new address. Correct?

**To do when convenient**
- ⏳ **When you want to help the user:** connect your phone as **Support copy** to their repository with a read-only token and their passphrase (Settings › Setup and support, step 7). Your test phone is disconnected, and the old test repository and its token were deleted (8 Nov 2026).
- ⏳ **The user's leases that were already running:** for a complete 2026 tax summary and charges reconciliation, set Edit › Start of tracking to January 2026 and enter the payments since then (or what was owed at that date).
- ⏳ **Before cancelling Gestion Locative Facile:** export its data and keep the files privately (not in this repository), as a record of past rents and receipts. On a computer: log in at immobilierloyer.com, tick Outils › Préférences › Réglages › Réglages avancés › "Export des données", then use **Exporter** on each page.
- ⏳ **Optional, fewer permission prompts for Claude:** add `.claude/settings.json` to this repository yourself (Claude isn't allowed to change its own permissions).

---

## Next

### 🔜 Milestone 7 · Version 1.4 · Fixes from real use
- [x] **1.3.13, third code review (9 Nov 2026), ready, not live yet:**
  - A rent revision and new monthly charges (from a charges reconciliation or "Change rent") recorded for different months no longer undo each other; recorded for the same month, both are kept. Undoing a reconciliation gives the old charges back and keeps the revision. "Change rent" shows the amounts in force in the month you choose.
  - A lease paid **in advance** every 3 or 6 months and not paid owes the whole period from its payment date (before: one more month each month), on the home screen, the lease page, the reminder and the formal notice.
- [ ] Also found by the third code review, not fixed yet:
  - A charges reconciliation that is overdue drops off the deadlines list on 1 January (the one for 2025 disappears on 1 Jan 2027 even if it was never done)
  - Charges reconciliation and departure screens: after typing an amount, the first tap on a button can be lost (seen in Chrome; to check on the iPhone)
  - A restore from GitHub interrupted at its last step shows an error but keeps the restored data in memory, unsaved (found by reading, not reproduced)
  - Leftover unused code: the old "end lease" window
- [ ] Bugs and annoyances found on the iPhone, as they come up
- [ ] Search across tenants, properties and payments
- [ ] Small wording and layout fixes

## On hold and dropped

### ⏸️ Milestone 6 · Bank import tuned to the user's banks (on hold since 6 Nov 2026)
The user enters payments by hand; the generic bank import still works. Would need a sample export from CIC and from Crédit Agricole.
- [ ] Column and date detection for the CIC and Crédit Agricole exports (OFX or Excel too, if CSV isn't offered)
- [ ] Two accounts read the same way, a transfer imported from one never doubling one from the other
- [ ] Optionally import money going out as expenses, with a suggested category
- [ ] Remember "this label always means this lease or this expense category"
- [ ] Match CAF transfers (their label often has no tenant name) to the right lease
- [ ] Action screen after each import: payments matched with "send receipt" ready, tenants still unpaid after a few days with "send reminder" ready; one tap per email, nothing sent twice

### ❌ Milestone 5 · Import from Gestion Locative Facile (dropped 7 Nov 2026)
Not needed: the user enters their own data from scratch. The plan is in the history of this file (commit [`cd93098`](https://github.com/hmaltawil/gestion-locative/blob/cd93098/ROADMAP.md)).

---

## Ideas backlog

💡 Not planned. Pick from here when choosing a milestone.
- **Rent control check** for cities that cap rents (Paris, Lyon, Lille, Bordeaux, Montpellier…) when re-letting
- **Loan schedule:** enter the loan once and the yearly interest goes to line 250 automatically
- **Yearly report per property:** income, costs, net yield
- **Vacancy and re-letting:** empty-period tracking, a checklist for the new tenant's file
- **Rental deficit carried forward** from one year to the next on form 2044
- **Archive each year's tax summary** once filed
- **Furnished rentals (LMNP)**, if one ever becomes furnished: different lease and tax regime
- **Full font for PDFs**, so names in any alphabet print exactly (today Łukasz → Lukasz). Cost: about 1 MB more in the app and in every PDF sent
- **Return of the 20% held back** for a building with shared accounts: a reminder once the building's accounts are approved, and the final statement
- **Charges split between several tenants of one property** (by share or surface); today the app warns
- **Encrypted manual backup file:** the file saved in iCloud Drive holds all tenant data unencrypted; it could use the GitHub backup's passphrase
- **App lock with Face ID or a PIN:** anyone holding the unlocked phone can open the app
- **An automatic copy before deleting a payment or an expense:** today only the daily copy covers them
- **The CAF's share on rent calls:** when the CAF pays part of the rent directly, show what is expected from the CAF and what the tenant still pays

## Later (larger projects, to decide when needed)

| Feature | Size | Notes |
|---|---|---|
| Lease contract from the official model lease | Large | Legal review needed; only worth it if you sign new leases often |
| Move-in/move-out inspection with photos and signatures on the iPhone | Large | Move-out compared against move-in; feeds the deposit return |
| Sync across devices (iPhone, iPad, computer) | Large | Needs a backend, for example a free Supabase account, plus a login |
| Full automation: bank checked daily, receipts and reminders sent by themselves | Very large (about 3 milestones) | Needs data in the cloud with a login, a bank-connection provider, an email service and a domain name; about €0 to €15 a month. Decided against for now (5 Nov 2026) |
| Legally strong e-signature | Medium | Needs a paid service such as Yousign |

## Known limitations (current version)

- Data lives on one iPhone. The GitHub backup is a copy, not a sync: if two phones are connected as main phone, the one that is behind stops saving and asks what to do
- If the GitHub passphrase is lost, the GitHub backups can't be read; the manual backup file isn't encrypted and still works
- Names with letters outside French and Western European alphabets are simplified in PDFs (Łukasz → Lukasz)
- Line 230 of form 2044 is entered by hand, from the managing agent's yearly statement
- The charges reconciliation assumes one tenant at a time per property (a warning shows otherwise)
- The tax summary is a guide; check it against that year's form 2044 instructions
- A lease's payment frequency applies to the whole lease, past months included
- Diagnostic validity rules are simplified (older DPEs have special rules); expiry dates can be edited
- Exporting to the Calendar again creates duplicate events unless the old ones are deleted first
- The bank import is generic (tuning it is on hold with milestone 6)
- The app shares its web address (`hmaltawil.github.io`) with the owner's Deutschlernen site, and so the browser's storage where both are opened. Decided on 7 Nov 2026 not to move it: the user's iPhone never opens Deutschlernen and the home-screen app has its own storage; the owner opens the support copy only from its home-screen icon
- A lease entered by hand while already running is tracked from the month it's entered, with today's rent, unless Start of tracking is set earlier (see Open items)

---

## Done

Every version below is live and was checked on the iPhone. Details are in each commit.

| Version | Date | What it brought | Code |
|---|---|---|---|
| 1.0 · Milestone 1 | 5 Nov 2026 | Offline app on the home screen, French and English screens, properties and leases, month-by-month rent tracking (oldest debt first, pro rata, opening balance), rent call, receipt, reminder and formal notice PDFs, IRL revision, expenses with their form 2044 line, signature, manual backup | [`61657c1`](https://github.com/hmaltawil/gestion-locative/commit/61657c1) |
| 1.1 · Milestone 2 | 5 Nov 2026 | Monthly send, bank CSV import, charges reconciliation, form 2044 summary, deadlines and Calendar export, diagnostic reports, attached documents, tenant departure and deposit return, other letters, one-off charges and credits | [`66c21b7`](https://github.com/hmaltawil/gestion-locative/commit/66c21b7) |
| 1.1.1 and 1.1.2 | 5 Nov 2026 | Light, dark or automatic theme; fixes from the first iPhone check (Calendar, bank import messages, Revolut files) | |
| 1.2 · Milestone 3 | 5 Nov 2026 | Data safety: automatic copies on the phone, encrypted automatic backup to a private GitHub repository, backup status and warnings | [`c4061e3`](https://github.com/hmaltawil/gestion-locative/commit/c4061e3) |
| 1.3 · Milestone 4 | 6 Nov 2026 | Main phone and support copy, anonymised support file, saved browser tests | [`9f92fda`](https://github.com/hmaltawil/gestion-locative/commit/9f92fda) |
| 1.3.1 | 6 Nov 2026 | First code review: deposit return and tax figures, rent call totals, backups never overwrite another phone's, guarantor statement, line 230 | [`53dd3fc`](https://github.com/hmaltawil/gestion-locative/commit/53dd3fc) |
| 1.3.2 and 1.3.3 | 6 Nov 2026 | Screen polish: columns that line up, signature in its own window, dark mode buttons, digit spacing | [`de2c168`](https://github.com/hmaltawil/gestion-locative/commit/de2c168), [`0955f62`](https://github.com/hmaltawil/gestion-locative/commit/0955f62) |
| 1.3.4 and 1.3.5 | 6 Nov 2026 | Correcting a lease's rent from its edit form; a greyed-out Reminder explains why; start of tracking editable | [`a1f6fdf`](https://github.com/hmaltawil/gestion-locative/commit/a1f6fdf), [`ddacbb9`](https://github.com/hmaltawil/gestion-locative/commit/ddacbb9) |
| 1.3.6 | 6 Nov 2026 | Receipts say who paid, tenant or CAF; CAF transfers recognised in the bank import | [`4ca75ad`](https://github.com/hmaltawil/gestion-locative/commit/4ca75ad) |
| 1.3.7 | 6 Nov 2026 | A payment dated in the future asks first | [`fb744d7`](https://github.com/hmaltawil/gestion-locative/commit/fb744d7) |
| 1.3.8 | 6 Nov 2026 | Safety review: restored files cleaned, browser security rule, likely mistakes questioned and legal limits refused, backup pauses before losing data | [`0bd9df4`](https://github.com/hmaltawil/gestion-locative/commit/0bd9df4) |
| 1.3.9 | 7 Nov 2026 | Second code review: long letters continue on a new page, departure keeps lease end and keys date apart, deposit books the amount actually returned, honest erase plus "Remove everything from this device", revision rounds down, "1.200" = 1 200 €, legal points (fixed charges, G/F/E homes, late reconciliation), CSV and encryption hardening | [`6bc4dfa`](https://github.com/hmaltawil/gestion-locative/commit/6bc4dfa) |
| 1.3.10 | 7 Nov 2026 | Settings › Setup and support: steps to set up the user's iPhone from scratch with its own backup repository | [`77ddd25`](https://github.com/hmaltawil/gestion-locative/commit/77ddd25) |
| 1.3.11 | 7 Nov 2026 | Rent paid every 3 or 6 months, in advance or in arrears: no false "late", one receipt and one rent call per period | [`70433ee`](https://github.com/hmaltawil/gestion-locative/commit/70433ee) |
| 1.3.12 | 8 Nov 2026 | Housekeeping: unused code removed, no visible change | [`70985ad`](https://github.com/hmaltawil/gestion-locative/commit/70985ad) |

## How we work

1. **One milestone at a time.** Each milestone is a version number and a short list of features, agreed before starting. Anything new goes into the [Ideas](#ideas-backlog).
2. **A milestone is done when:** the tests pass (`npm test`, then `npm run serve` and `npm run e2e`); `VERSION` in `sw.js`, `APP_VERSION` in `js/app.js` and `version` in `package.json` are bumped; the README and this file are updated, with the commit linked in [Done](#done); it is pushed to `main` and the live `sw.js` shows the new version; it has been checked on the iPhone.
3. **Bugs found on the iPhone** go at the top of the next milestone.
