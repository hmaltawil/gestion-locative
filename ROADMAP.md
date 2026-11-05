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

---

## Waiting on you

- ⏳ **Bank CSV sample** (account numbers removed) and the bank's name, to tune the import. This is milestone 4.
- ⏳ **First check on the real iPhone.** Report anything that doesn't work:
  - [ ] Add to Home Screen, then open from the icon
  - [ ] Share menu: send a receipt by Mail
  - [ ] Backup to Files › iCloud Drive, then restore it
  - [ ] Attach a photo with the camera
  - [ ] Choose a bank CSV file
  - [ ] Open the calendar file and add the events
  - [ ] "New version available" bar after an update
- ⏳ **Legal check, done once:** have the guarantor agreement, formal notice and deposit return letter reviewed, for example by your local ADIL.

---

## Next

### 🔜 Milestone 3 · Version 1.2 · Data safety
Data lives only on the phone, so protecting it comes first.
- [ ] Automatic snapshots inside the app: one a day for 14 days, plus one before each import, restore or deletion; a screen to restore any of them
- [ ] Automatic encrypted backup to a private GitHub repository after each change (passphrase plus an access token limited to that repository; every version kept)
- [ ] Backup status in Settings: last snapshot, last off-device backup, any errors
- [ ] One-tap manual backup, prepared in the background

### Milestone 4 · Version 1.3 · Bank import, tuned to your bank
- [ ] Adapt column and date detection to your bank's export
- [ ] Optionally import money going out as expenses, with a suggested category
- [ ] Remember "this label always means this lease or this expense category"
- [ ] Handle the CAF paying part of the rent directly to you

### Milestone 5 · Version 1.4 · Fixes from real use
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
| Emails sent automatically each month | Medium | Needs a server or email service |
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

- Data is on one iPhone only, so backups matter (see milestone 3)
- Not yet tested on a real iPhone (see [Waiting](#waiting-on-you))
- The tax summary is a guide; check it against that year's form 2044 instructions
- Diagnostic validity rules are simplified (older DPEs have special rules); expiry dates can be edited
- Exporting to the Calendar again creates duplicate events unless the old ones are deleted first
- The bank import is generic until it's tuned to your bank
