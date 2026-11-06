# Roadmap

One place to see what's done, what's waiting, and what comes next. Update it at the end of each milestone.

**Status:** ✅ done · 🔜 next · ⏳ waiting on someone · 💡 idea, not planned yet

**Where we are (6 Nov 2026):** milestones 1 to 4 are done, followed today by a full code review (version 1.3.1: wrong numbers, backup safety, privacy and legal fixes), screen polish (versions 1.3.2 and 1.3.3) and fixes from real use (version 1.3.4: correcting a lease's rent; version 1.3.5: why a reminder can't be sent yet, and money owed from before). All of it is live; 1.3.4 and 1.3.5 still need their iPhone check. The review's open points are in [Waiting](#waiting-on-you) (questions for the ADIL), in milestone 5 (payment history) and in the [Ideas](#ideas-backlog). **Next:** milestone 5, as soon as the Gestion Locative Facile export files arrive; then milestone 6 with sample files from CIC and Crédit Agricole.

## How we work

1. **One milestone at a time.** Each milestone is a version number (1.2, 1.3…) and a short list of features.
2. **Before starting,** agree on the list. Anything new goes into [Ideas](#ideas-backlog), not into the current milestone.
3. **A milestone is done when:**
   - the calculation tests pass (`npm test`) and the browser tests pass (`npm run serve`, then `npm run e2e`);
   - `VERSION` in `sw.js`, `APP_VERSION` in `js/app.js` and `version` in `package.json` are bumped;
   - the README and this file are updated, with the milestone's commit linked below;
   - it is pushed to `main` and the live `sw.js` shows the new version;
   - it has been checked on the real iPhone (see [Waiting](#waiting-on-you)).
4. **Bugs found on the iPhone** go at the top of the next milestone.

---

## Done

### ✅ Milestone 1 · Version 1.0 · Foundation (5 Nov 2026)
Code: [`61657c1`](https://github.com/hmaltawil/gestion-locative/commit/61657c1)

- [x] Offline web app, installable on the iPhone home screen, hosted on GitHub Pages
- [x] French and English screens; PDF documents always in French
- [x] Properties (with DPE rating) and leases (co-tenants, guarantor, deposit, payment day)
- [x] Month-by-month rent tracking: paid, partial, late; oldest debt paid first; pro-rated first and last months; opening balance for leases already running
- [x] PDFs: rent call, receipt, partial receipt, reminder, formal notice
- [x] Yearly rent revision with the INSEE index (IRL), revision letter, F/G properties blocked
- [x] Expenses by category, with the matching line of tax form 2044
- [x] Finger signature added to documents
- [x] Manual backup and restore (a JSON file in iCloud Drive), with a reminder after 7 days

### ✅ Milestone 2 · Version 1.1 · Landlord toolkit (5 Nov 2026)
Code: [`66c21b7`](https://github.com/hmaltawil/gestion-locative/commit/66c21b7)

- [x] Monthly send: all receipts or rent calls for a month, one per tenant or all in one PDF
- [x] Bank statement import (any bank's CSV) with automatic matching to leases, no duplicates
- [x] Yearly charges reconciliation: letter, balance added to the tenant's account, new monthly advance
- [x] Form 2044 summary (rents counted when received), micro-foncier comparison, PDF and CSV export
- [x] Deadlines: insurance, diagnostics, lease term and notice, deposit return, revisions, reconciliation, custom reminders; export to the iPhone Calendar
- [x] Diagnostic reports per property, with expiry dates
- [x] Documents (photos, PDFs) attached to properties, leases and expenses, and included in backups
- [x] Tenant departure: deposit return statement, deductions, 20% held back, legal deadline and penalty
- [x] Letters: rent certificate, deposit receipt, guarantor agreement
- [x] One-off charges and credits on a lease
- [x] Reliable updates: new versions are detected and always install fresh files

### ✅ Version 1.1.1 · Light theme (5 Nov 2026)
- [x] Appearance setting in Settings: Light (default), Dark, or Automatic (follows the iPhone)
- [x] The theme is applied before the screen draws, so there's no dark flash at launch

### ✅ Version 1.1.2 · Fixes from the first iPhone check (5 Nov 2026)
- [x] Calendar: the iPhone share menu doesn't offer Calendar, so there's a new "Open in Calendar" button plus an "email it to yourself" fallback
- [x] Bank import: a clear message when no incoming payment looks like rent
- [x] Bank import: Revolut-style files use the booked ("Completed") date and skip pending or declined lines

### ✅ Milestone 3 · Version 1.2 · Data safety (5 Nov 2026)
Code: [`c4061e3`](https://github.com/hmaltawil/gestion-locative/commit/c4061e3)

- [x] Automatic copies on the phone: one a day for 14 days, plus one before each bank import, restore, deletion or erase; restore any of them from Settings
- [x] Deleted documents keep their file 15 days, so restoring a copy brings them back
- [x] Automatic backup to a private GitHub repository, a few seconds after each change and when leaving the app
  - encrypted on the phone (AES-256-GCM, key from your passphrase); GitHub only receives unreadable files
  - photos and PDFs uploaded as separate files, once each
  - public repositories refused; the token and passphrase never go into backups or copies
  - an empty new phone never overwrites an existing backup; it offers to restore it instead
  - "Restore from GitHub" lists every version, so you can pick the one to bring back
- [x] Backup status in Settings, home warnings when the GitHub backup fails or the token is about to expire
- [x] One-tap manual backup (the file is prepared in the background)

### ✅ Milestone 4 · Version 1.3 · Handover and support (6 Nov 2026)
Code: [`9f92fda`](https://github.com/hmaltawil/gestion-locative/commit/9f92fda)

Built before the import because the import was waiting for the export files.
- [x] Each connected device has a role: **main phone** (saves backups) or **support copy** (read-only)
- [x] Support copy: restores the user's latest GitHub backup, shows a bar on every screen, never uploads, "Refresh from GitHub" gets the newest version
- [x] Anonymised support file: names, contact details, addresses, notes and bank labels replaced; amounts and dates kept; restorable in a test browser (with a warning)
- [x] Handover checklist in Settings › Handover and support
- [x] Browser tests saved in `tests/e2e/` (see CLAUDE.md)

### ✅ Version 1.3.1 · Fixes from the code review (6 Nov 2026)
Code: [`53dd3fc`](https://github.com/hmaltawil/gestion-locative/commit/53dd3fc). Checked on the iPhone (6 Nov 2026).

Wrong numbers:
- [x] Deposit return: a tenant who had paid too much no longer ends up owing money afterwards; the account now ends at exactly what the statement says
- [x] Tax summary: a refund from the charges reconciliation no longer lowers the rent counted on line 211
- [x] Rent call: the lease page and the monthly send give the same total, including unpaid one-off charges, the opening balance, any part already paid and any advance
- [x] Deposit returned late: the 10% penalty is added to the amount to return, to the letter and to "Mark as returned" (and is not due when nothing is left to return)

Backup and data safety:
- [x] A phone that is behind no longer overwrites a backup saved by another phone: it stops, says so on the home screen, and offers "Restore from GitHub" or "Save this phone's data anyway"
- [x] Bank import: a payment already typed in by hand (same amount, within 7 days) is flagged and left unticked
- [x] "Restore from GitHub": all versions can be reached ("Show older versions"), not only the latest 30

Privacy:
- [x] Anonymised support file: notes on rent changes and departure deductions are removed too

Legal and tax:
- [x] Guarantor agreement: the guarantor's handwritten statement gives the amount in figures and in words and, for a joint guarantee, the acknowledgment required by article 2297 of the Civil Code; it stays on one page with the signatures (to confirm with the ADIL, see [Waiting](#waiting-on-you))
- [x] Form 2044 line 230 can be entered on the tax screen, and is subtracted from the costs
- [x] Warning when the deposit is more than one month's rent excluding charges

Smaller:
- [x] PDFs: names with letters the PDF fonts lack are simplified instead of garbled (Łukasz → Lukasz, Nguyễn → Nguyên)
- [x] Charges reconciliation: warning when another lease of the same property runs at the same time
- [x] Bank files: amounts like "650,00-", "EUR 650,00" or "(45,20)" are read; impossible dates such as 31/02 are refused
- [x] No zoom on the iPhone when choosing a lease in the bank import
- [x] "Received this month" no longer counts the deposit kept at a departure as money received

### ✅ Version 1.3.2 · Screen polish (6 Nov 2026)
Code: [`de2c168`](https://github.com/hmaltawil/gestion-locative/commit/de2c168). Asked for after using 1.3.1. Checked on the iPhone (6 Nov 2026).
- [x] Home: the three amounts at the top line up, even when a label takes two lines
- [x] Home rents, deadlines, the monthly send and the month-by-month list: statuses, amounts and buttons line up from row to row, in French and in English
- [x] A late rent shows "Late" with the amount below it, like the other rows
- [x] Signature: drawn in its own window, opened with "Add a signature", so scrolling Settings can no longer leave marks; removing it asks first
- [x] Lists of properties, leases and expenses: no more blank line between a name and its details
- [x] Dark mode: the text on blue buttons is dark, so it can be read
- [x] Lease form: "Charges type" uses the full width, so its text isn't cut off

### ✅ Version 1.3.3 · Fix from the 1.3.2 iPhone check (6 Nov 2026)
Code: [`0955f62`](https://github.com/hmaltawil/gestion-locative/commit/0955f62). Checked on the iPhone (6 Nov 2026).

- [x] Big amounts (the home tiles, the balance on a lease) use normal digit spacing: equal-width digits left gaps around every "1" (1 715,01 €). Lists keep equal-width digits so the amounts in a column line up

### ✅ Version 1.3.4 · Fix from real use (6 Nov 2026)
iPhone check pending (see [Waiting](#waiting-on-you)).
- [x] Editing a lease: the rent and charges can be corrected (a typing mistake). The form shows the amounts in force today, asks before changing what every month since then owes, and keeps the history of earlier amounts and revisions. A real change from a given month still goes through "Change rent"

### ✅ Version 1.3.5 · Fix from real use (6 Nov 2026)
iPhone check pending (see [Waiting](#waiting-on-you)). Reported as "no reminder without an end date"; the end date was not the cause: a reminder or formal notice only claims money already late, and the grey button gave no reason.
- [x] "Reminder" and "Formal notice" are never a dead grey button: when nothing is late, a tap says what is due next, from which day a reminder is possible, and offers the rent call instead
- [x] Editing a lease shows "Start of tracking" too, so money a tenant owed from before the app was used can still be entered (it then counts as late, and a reminder can claim it)

---

## Waiting on you

- ✅ **GitHub backup set up** (5 Nov 2026) to the private repository `locatif-sauvegarde`. Passphrase on paper; revoke the token on GitHub if the phone is lost.
- ⏳ **Optional, fewer permission prompts for Claude:** add `.claude/settings.json` to this repository yourself (Claude isn't allowed to change its own permissions).
- ⏳ **Gestion Locative Facile export files** (format only, names replaced), for milestone 5. On a computer: log in at immobilierloyer.com, tick Outils › Préférences › Réglages › Réglages avancés › "Export des données", then use **Exporter** on each page. Export before cancelling the subscription.
- ⏳ **Bank file samples** for milestone 6. The banks are **CIC** and **Crédit Agricole** (6 Nov 2026). One export from each, from the bank's website (not the monthly PDF statement): CSV if offered, otherwise Excel or OFX. Remove the account numbers and replace tenants' names before sending (this repository is public).
- ✅ **First check on the real iPhone:** everything works (5 Nov 2026)
  - [x] Add to Home Screen, then open from the icon
  - [x] Share menu: send a receipt by Mail
  - [x] Backup to Files › iCloud Drive, then restore it
  - [x] Attach a photo with the camera
  - [x] "New version available" bar after an update
  - [x] Deadlines › Add to Calendar (fixed in 1.1.2)
  - [x] Choose a bank CSV file (works with Revolut; your real bank's file comes with milestone 6)
- ✅ **Version 1.3.1 checked on the iPhone** (6 Nov 2026)
  - [x] Settings › About shows 1.3.1
  - [x] A rent call from a lease page and from the monthly send show the same total
  - [x] Tax summary › line 230 can be saved
  - [x] A guarantor agreement PDF: the statement to copy by hand and the signatures are on the same page
- ✅ **Versions 1.3.2 and 1.3.3 checked on the iPhone** (6 Nov 2026)
  - [x] Settings › About shows 1.3.3
  - [x] Home: "1 715,01 €" in the tiles is as evenly spaced as the other amounts
  - [x] Home: the three amounts at the top, and the rents' statuses, amounts and Record/✓ column, line up
  - [x] Settings › Signature › Add a signature: draw, save, and scrolling Settings never draws
  - [x] In dark mode, the text on blue buttons is easy to read
- ⏳ **Check versions 1.3.4 and 1.3.5 on the iPhone:** open the app, tap the "new version" bar, then try:
  - [ ] Settings › About shows 1.3.5
  - [ ] A lease › Edit: the rent and charges show the amounts in force; change one, save, confirm, and the lease page shows the new amount
  - [ ] A lease with nothing late › Reminder: a window explains what is due next and offers the rent call
  - [ ] A lease › Edit › Start of tracking: enter an amount owed from before, save, and Reminder then works
- ⏳ **Legal check, done once:** have the guarantor agreement, formal notice and deposit return letter reviewed, for example by your local ADIL. Questions to ask:
  - Guarantor agreement: since 2022 (article 2297 of the Civil Code), is the handwritten statement now complete (amount in figures and words; for a joint guarantee, the acknowledgment that the landlord need not pursue the tenant first)?
  - Rent revision claimed late: which IRL value applies, the latest published on the anniversary date or the latest published on the day of the request? Today the app uses the latest available on the day you tap, so with an anniversary just before INSEE publishes, a few days' difference changes the index used. Once answered, the app can follow the rule.
  - Deposit returned late: the app adds the penalty (10% of the rent per started month) and notes that it is not due if the tenant gave no new address. Correct?

---

## Next

### 🔜 Milestone 5 · Version 1.4 · Import from Gestion Locative Facile
Waiting for the CSV export files (format only, with names replaced). Decided 6 Nov 2026.
Goal: no retyping of the 15 leases.
- [ ] Read the CSV files exported from immobilierloyer.com (Locataires, Contrats, Loyers et paiements, Charges et frais, Biens if offered)
- [ ] Create properties, tenants, leases (rent, charges, deposit, dates, rent index) and the payment history
- [ ] Import expenses and charges into the expense log
- [ ] A review screen before confirming: what will be created, anything that couldn't be read
- [ ] A snapshot before the import, so it can be undone in one tap
- [ ] The import runs on the iPhone: the real files never leave it
- [ ] Bring in at least the 2025 and 2026 payment and rent history (found in the review): leases already running are tracked from the current month with today's rent, so without it the 2026 tax summary and the 2025 charges reconciliation would be wrong for those leases

### Milestone 6 · Version 1.5 · Bank import and semi-automatic follow-up
Waiting for a sample export from CIC and from Crédit Agricole.
Goal: a monthly routine of about 5 minutes. Download the bank file, import it, then tap through receipts and reminders.
- [ ] Adapt column and date detection to the CIC and Crédit Agricole exports (support OFX or Excel too, if CSV isn't offered)
- [ ] Two accounts: rent can arrive at either bank, so both files are read the same way, and a transfer imported from one never doubles one from the other
- [ ] Optionally import money going out as expenses, with a suggested category
- [ ] Remember "this label always means this lease or this expense category"
- [ ] Handle the CAF paying part of the rent directly to you
- [ ] **Action screen after each import** (decided 5 Nov 2026):
  - payments matched, each with "send receipt" ready
  - tenants still unpaid a set number of days after the due date (5 by default), each with "send reminder" ready
  - one tap per email (iOS rule); nothing is sent without your tap, so a wrong match never becomes a wrong receipt
  - each item marked as sent, so nothing is sent twice

### Milestone 7 · Version 1.6 · Fixes from real use
- [ ] Bugs and annoyances found on the iPhone
- [ ] Search across tenants, properties and payments
- [ ] Small wording and layout fixes

---

## Later (larger projects, to decide when needed)

| Feature | Size | Notes |
|---|---|---|
| Lease contract from the official model lease | Large | Legal review needed; only worth it if you sign new leases often |
| Move-in/move-out inspection with photos and signatures on the iPhone | Large | Move-out compared against move-in; feeds the deposit return |
| Sync across devices (iPhone, iPad, computer) | Large | Needs a backend, for example a free Supabase account, plus a login |
| Full automation: bank checked daily, receipts and reminders sent by themselves | Very large (about 3 milestones) | Needs data in the cloud with a login, a bank-connection provider, an email service and a domain name; about €0 to €15 a month. **Decided against for now (5 Nov 2026):** revisit after a few months of the semi-automatic routine |
| Legally strong e-signature | Medium | Needs a paid service such as Yousign |

## Ideas backlog

💡 Not planned. Pick from here when choosing a milestone.
- **Rent control check** for cities that cap rents (Paris, Lyon, Lille, Bordeaux, Montpellier…) when re-letting
- **Loan schedule:** enter the loan once and the yearly interest goes to line 250 automatically
- **Yearly report per property:** income, costs, net yield
- **Vacancy and re-letting:** empty-period tracking, a checklist for the new tenant's file
- **Rental deficit carried forward** from one year to the next on form 2044
- **Archive each year's tax summary** once filed
- **Furnished rentals (LMNP)**, if one ever becomes furnished: different lease and tax regime
- **Full font for PDFs**, so names in any alphabet print exactly (today letters outside French and Western European ones are simplified: Łukasz → Lukasz). Cost: about 1 MB more in the app and in every PDF sent
- **Return of the 20% held back** for a building with shared accounts: a reminder once the building's accounts are approved, and the final statement
- **Charges split between several tenants of one property** (by share or surface), if a property ever holds more than one letting at the same time; today the app warns

## Known limitations (current version)

- Data is used on one iPhone. With the GitHub backup on, it's also stored off the phone, but it's not a sync: if two phones are connected as main phone, the one that is behind stops saving and asks what to do
- If the GitHub passphrase is lost, the GitHub backups can't be read; the manual backup file isn't encrypted and still works
- Names with letters outside French and Western European alphabets are simplified in PDFs (Łukasz → Lukasz)
- Line 230 of form 2044 is entered by hand, from the managing agent's yearly statement
- The charges reconciliation assumes one tenant at a time per property (a warning shows otherwise)
- The tax summary is a guide; check it against that year's form 2044 instructions
- Diagnostic validity rules are simplified (older DPEs have special rules); expiry dates can be edited
- Exporting to the Calendar again creates duplicate events unless the old ones are deleted first
- The bank import is generic until it's tuned to CIC and Crédit Agricole (milestone 6)
