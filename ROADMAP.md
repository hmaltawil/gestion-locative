# Roadmap

One place to see what's done, what's waiting, and what comes next. Update it at the end of each milestone.

**Status:** ✅ done · 🔜 next · ⏳ waiting on someone · 💡 idea, not planned yet

## How we work

1. **One milestone at a time.** Each milestone is a version number (1.2, 1.3…) and a short list of features.
2. **Before starting,** agree on the list. Anything new goes into [Ideas](#ideas-backlog), not into the current milestone.
3. **A milestone is done when:**
   - the calculation tests pass (`npm test`), and the new screens have been run in a phone-sized browser;
   - `VERSION` in `sw.js` and `APP_VERSION` in `js/app.js` are bumped;
   - the README and this file are updated, with the milestone's commit linked below;
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

---

## Waiting on you

- ✅ **GitHub backup set up** (5 Nov 2026) to the private repository `locatif-sauvegarde`. Passphrase on paper; revoke the token on GitHub if the phone is lost.
- ⏳ **Optional, fewer permission prompts for Claude:** add `.claude/settings.json` to this repository yourself (Claude isn't allowed to change its own permissions).
- ⏳ **Gestion Locative Facile export files** (format only, names replaced), for milestone 4. On a computer: log in at immobilierloyer.com, tick Outils › Préférences › Réglages › Réglages avancés › "Export des données", then use **Exporter** on each page. Export before cancelling the subscription.
- ⏳ **Bank CSV sample** (account numbers removed) and the bank's name, to tune the import. This is milestone 6. It's exported from the bank's website, not the monthly PDF statement.
- ✅ **First check on the real iPhone:** everything works (5 Nov 2026)
  - [x] Add to Home Screen, then open from the icon
  - [x] Share menu: send a receipt by Mail
  - [x] Backup to Files › iCloud Drive, then restore it
  - [x] Attach a photo with the camera
  - [x] "New version available" bar after an update
  - [x] Deadlines › Add to Calendar (fixed in 1.1.2)
  - [x] Choose a bank CSV file (works with Revolut; your real bank's file comes with milestone 6)
- ⏳ **Legal check, done once:** have the guarantor agreement, formal notice and deposit return letter reviewed, for example by your local ADIL.

---

## Next

### 🔜 Milestone 4 · Version 1.3 · Import from Gestion Locative Facile
Waiting for the CSV export files (format only, with names replaced). Decided 6 Nov 2026.
Goal: no retyping of the 15 leases.
- [ ] Read the CSV files exported from immobilierloyer.com (Locataires, Contrats, Loyers et paiements, Charges et frais, Biens if offered)
- [ ] Create properties, tenants, leases (rent, charges, deposit, dates, rent index) and the payment history
- [ ] Import expenses and charges into the expense log
- [ ] A review screen before confirming: what will be created, anything that couldn't be read
- [ ] A snapshot before the import, so it can be undone in one tap
- [ ] The import runs on the iPhone: the real files never leave it

### Milestone 5 · Version 1.4 · Handover and support
Decided 6 Nov 2026. You set everything up and check it, then hand it to the person who will use it, and can still help when something goes wrong.
- [ ] **Handover:** the user's iPhone restores your finished setup from the GitHub backup, then becomes the only phone that saves to it
- [ ] **Support copy (read-only):** open the latest GitHub backup on your own phone or computer to see exactly what the user sees, without ever saving over their data
- [ ] **Anonymised support file:** exports the data with names, emails, phone numbers and addresses replaced, safe to share with Claude when investigating a problem
- [ ] A short handover checklist (passphrase on paper, own token per phone, what to do if the phone is lost)

### Milestone 6 · Version 1.5 · Bank import and semi-automatic follow-up
Waiting for your bank's CSV sample.
Goal: a monthly routine of about 5 minutes. Download the bank file, import it, then tap through receipts and reminders.
- [ ] Adapt column and date detection to your bank's export (support OFX or Excel too, if your bank has no CSV)
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

## Known limitations (current version)

- Data is used on one iPhone. With the GitHub backup on, it's also stored off the phone, but it's not a sync: if two phones were connected to the same repository, the last one to save would replace the other's data
- If the GitHub passphrase is lost, the GitHub backups can't be read; the manual backup file isn't encrypted and still works
- Not yet tested on a real iPhone (see [Waiting](#waiting-on-you))
- The tax summary is a guide; check it against that year's form 2044 instructions
- Diagnostic validity rules are simplified (older DPEs have special rules); expiry dates can be edited
- Exporting to the Calendar again creates duplicate events unless the old ones are deleted first
- The bank import is generic until it's tuned to your bank
