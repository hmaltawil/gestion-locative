# Roadmap

One place to see what's done, what's waiting, and what comes next. Update it at the end of each milestone.

**Status:** ✅ done · 🔜 next · ⏳ waiting on someone · ⏸️ on hold · ❌ dropped · 💡 idea, not planned yet

**Where we are (7 Nov 2026):** milestones 1 to 4 are done, followed by a full code review (version 1.3.1: wrong numbers, backup safety, privacy and legal fixes), screen polish (versions 1.3.2 and 1.3.3), fixes from real use (version 1.3.4: correcting a lease's rent; version 1.3.5: why a reminder can't be sent yet, and money owed from before), who paid on receipts, tenant or CAF (version 1.3.6), a warning for payments dated in the future (version 1.3.7) and a safety review (version 1.3.8: security, mistakes the app now questions, legal checks, backups). All of it is live and checked on the iPhone. A second code review (7 Nov 2026) brought version 1.3.9: long letters, the departure, erasing, share failures and legal points; it is live and checked on the iPhone. Version 1.3.10 replaces the handover checklist with setup steps for the user's iPhone, and 1.3.11 adds rent paid every 3 or 6 months. The review's open points are in [Waiting](#waiting-on-you) (questions for the ADIL) and in the [Ideas](#ideas-backlog). **Next:** milestone 7, fixes from real use, as they come up. The user enters their own data on their own iPhone: there is no handover from the owner's phone and no import from Gestion Locative Facile (milestone 5 dropped on 7 Nov 2026). The tuned bank import (milestone 6) stays [on hold](#on-hold).

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
Code: [`a1f6fdf`](https://github.com/hmaltawil/gestion-locative/commit/a1f6fdf). Checked on the iPhone (6 Nov 2026).
- [x] Editing a lease: the rent and charges can be corrected (a typing mistake). The form shows the amounts in force today, asks before changing what every month since then owes, and keeps the history of earlier amounts and revisions. A real change from a given month still goes through "Change rent"

### ✅ Version 1.3.5 · Fix from real use (6 Nov 2026)
Code: [`ddacbb9`](https://github.com/hmaltawil/gestion-locative/commit/ddacbb9). Checked on the iPhone (6 Nov 2026). Reported as "no reminder without an end date"; the end date was not the cause: a reminder or formal notice only claims money already late, and the grey button gave no reason.
- [x] "Reminder" and "Formal notice" are never a dead grey button: when nothing is late, a tap says what is due next, from which day a reminder is possible, and offers the rent call instead
- [x] Editing a lease shows "Start of tracking" too, so money a tenant owed from before the app was used can still be entered (it then counts as late, and a reminder can claim it)

### ✅ Version 1.3.6 · Who paid, on receipts (6 Nov 2026)
Code: [`4ca75ad`](https://github.com/hmaltawil/gestion-locative/commit/4ca75ad). Asked for on 6 Nov 2026. Checked on the iPhone (6 Nov 2026).
- [x] Receipts and partial receipts say who paid: "reçu de [tenant] et de la CAF (aide au logement versée directement au bailleur)", then list each payment for the month with its date, who paid it (tenant, CAF, deposit, credit) and the amount
- [x] Bank import: transfers from the CAF or the MSA are recognised from their label and recorded as CAF payments (shown with a "CAF" tag), so receipts get it right

### ✅ Version 1.3.7 · Payments dated in the future (6 Nov 2026)
Code: [`fb744d7`](https://github.com/hmaltawil/gestion-locative/commit/fb744d7). Asked about on 6 Nov 2026. Checked on the iPhone (6 Nov 2026).
- [x] Recording a payment with a date after today asks first. Such a payment made the month count as paid (receipt included) before the money arrived, and is usually a typing mistake (a post-dated cheque can be cashed straight away, so it is recorded on the day it is deposited). It is a warning, not a block

### ✅ Version 1.3.8 · Safety review (6 Nov 2026)
Code: [`0bd9df4`](https://github.com/hmaltawil/gestion-locative/commit/0bd9df4). Asked for on 6 Nov 2026 ("I want the app to be safe"). Checked on the iPhone (6 Nov 2026).

Security:
- [x] A crafted backup file could run code inside the app (shown on a test copy). Every file read back (restore, GitHub, automatic copies, the app's own storage) is now cleaned: ids, dates, months and the signature must look like what the app writes
- [x] A browser security rule (Content Security Policy): only the app's own code runs, and the app only talks to GitHub and INSEE

Mistakes the app now questions (it asks first) or refuses:
- [x] Payment dated before the start of tracking, or far above what is owed plus two months (asks)
- [x] Negative rent, charges, deposit, new charges advance or departure deduction (refused)
- [x] Expense, diagnostic report or deposit return dated in the future; insurance valid more than 15 months ahead; last revision in the future; lease starting more than a year ahead or before 1980 (asks)

Legal safety:
- [x] Rent revision: "Apply from" can't be earlier than allowed (no backdating, refused)
- [x] "Change rent": a rent increase on a property rated F or G is refused; an increase mid-lease, or a backdated one, asks first; a change before the lease start is refused. Charges changes stay free
- [x] Formal notice with no reminder made in the app first: a window says so and offers the reminder (reminders made are now remembered)
- [x] Guarantor agreement with a maximum of 0 € (refused)

Backups:
- [x] The GitHub backup pauses, with a warning on the home screen, when it would lose more than half of the leases, properties or payments (after an erase or a mass deletion); "Save this phone's data anyway" goes ahead
- [x] New GitHub connections need a passphrase of at least 12 characters
- [x] Attachments over 15 MB are refused, with a message

### ✅ Version 1.3.9 · Fixes from the second code review (7 Nov 2026)
Code: [`6bc4dfa`](https://github.com/hmaltawil/gestion-locative/commit/6bc4dfa). Asked for on 7 Nov 2026 ("review this code… go all in", then "for 2 until 5 you can start fixing"). Checked on the iPhone (7 Nov 2026).

Wrong documents or money:
- [x] Reminder and formal notice: a long list of unpaid months continues on the next page (column titles repeated), with the total; it used to run off the page. Every table in the PDFs does the same
- [x] Departure: "Lease end (end of notice)" and "Keys returned on" are separate. Rent is due until the lease end, even when the keys come back earlier (article 15); the deposit deadline runs from the keys
- [x] Deposit returned: the amount actually sent back is what the account books; a different amount than the statement asks first and the difference stays on the account
- [x] Rent revision: rounded down to the cent, never above the legal maximum (it rounded to the nearest cent)
- [x] Amounts: "1.200" or "1,200" is 1 200 € (it was read as 12 €)
- [x] A share menu that fails (other than Cancel) no longer counts as a backup made or a letter sent; the backup asks whether the file was saved

Clearer and safer:
- [x] "Erase all data" says it can be undone (copy kept 14 days); new "Remove everything from this device" really removes data, copies, documents and GitHub settings
- [x] Deleting a lease or a property with payments from earlier years says which tax summaries lose them
- [x] Values typed into the address bar (expenses filter, monthly send month) can no longer add content to the page

Crashes and rare failures:
- [x] A lease page with an IRL quarter but no year opens again
- [x] A lease without a valid start date (from a damaged file) is repaired when the data is read, instead of crashing screens
- [x] Restoring (file, automatic copy, GitHub) pauses the automatic GitHub backup until it's done
- [x] The backup file is built one document at a time, so many photos weigh less on the iPhone's memory

Legal and tax:
- [x] Fixed charges (forfait) on an unfurnished lease: the app asks first, since the law allows them only in a flat-share (article 8-1); the tax summary shows fixed charges received apart, to check whether they count as rent
- [x] Charges reconciliation done after the end of the following year: the letter and the screen say the tenant can pay in twelve monthly instalments (article 23)
- [x] Undoing a charges reconciliation also takes back the new monthly charges it set
- [x] Homes rated G (from 2025), F (from 2028) and E (from 2034): a note on the property and a question before a new lease, since they can no longer be let or renewed
- [x] Revision date of 29 February, and lease terms after a leap year: the right day

Smaller:
- [x] Accountant CSV: no formulas in Excel, French labels, the deposit applied at a departure named as such
- [x] Encryption of new GitHub backups: 600,000 rounds (older backups still open); a tampered file can't make the phone work for minutes
- [x] Support copy: wording says it never saves to GitHub; a read-only token is enough
- [x] A test checks that every app file is in the offline list (`sw.js`)

Not done yet (the owner asked first how serious it is): the app's own web address, separate from `hmaltawil.github.io`, which another of the owner's sites shares; see [Ideas](#ideas-backlog).

### ✅ Version 1.3.10 · Setup steps for the user's iPhone (7 Nov 2026)
Asked for on 7 Nov 2026 ("replace the handover checklist with setup steps"), after deciding there is no handover: the user enters their own data. Waiting for the iPhone check (see [Waiting](#waiting-on-you)).
- [x] Settings › "Setup and support" (was "Handover and support"): eight steps to set up the user's iPhone from scratch: a new private repository, a token for their phone, a new passphrase on paper, adding the app to the home screen (with the app's own address), connecting as main phone, what to do if the repository already holds a backup, a read-only token for the owner's support copy, and never deleting the icon
- [x] The anonymised support file stays in the same card

### ✅ Version 1.3.11 · Rent paid every 3 or 6 months (7 Nov 2026)
Asked for on 7 Nov 2026 ("I want to be able to choose the payment frequency and edit the current leases and make sure that it shows on the receipt"). Waiting for the iPhone check (see [Waiting](#waiting-on-you)).
- [x] Lease form (new and existing leases): payment frequency (monthly, every 3 months, every 6 months), paid at the start of the period (in advance) or at its end (in arrears), and the month a period starts (for example January for calendar quarters)
- [x] Every month of a period is due on the period's payment date, so a tenant paying at the end of the quarter isn't shown as late before then
- [x] One payment for the whole period is recorded without the "much more than owed" question
- [x] Receipts cover the whole period: one receipt per quarter or half-year ("au titre du paiement trimestriel… pour la période du 01/10 au 31/12", rent and charges with "(3 mois)"), from the lease page, the receipt list and the monthly send
- [x] Rent calls cover the whole period ("Loyer trimestriel : octobre à décembre"), with the period's payment date
- [x] Monthly send: such a lease appears in the first month of each period; the other months say which period paid them
- [x] The lease page shows the payment terms and the current period; "Expected this month" on the home screen counts a whole period in the month it's due; the bank import matches a whole period's amount

---

## Waiting on you

- ✅ **GitHub backup set up** (5 Nov 2026) to the private repository `locatif-sauvegarde` (the owner's phone, test data only since 7 Nov 2026). Passphrase on paper; revoke the token on GitHub if the phone is lost.
- ⏳ **Optional, fewer permission prompts for Claude:** add `.claude/settings.json` to this repository yourself (Claude isn't allowed to change its own permissions).
- ❌ **Import files:** the Gestion Locative Facile export files aren't needed (milestone 5 dropped, 7 Nov 2026). The CIC and Crédit Agricole samples would only be needed if milestone 6 comes back (see [On hold](#on-hold)).
- ⏳ **Recommended anyway: export the Gestion Locative Facile data before cancelling that subscription**, and keep the files privately (not in this repository), as a record of past rents, receipts and payments (for example if the tax office asks about an earlier year). On a computer: log in at immobilierloyer.com, tick Outils › Préférences › Réglages › Réglages avancés › "Export des données", then use **Exporter** on each page.
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
- ✅ **Version 1.3.7 checked on the iPhone** (6 Nov 2026)
  - [x] Settings › About shows 1.3.7
  - [x] Record a payment with a date in the future: the app asks first; "Cancel" records nothing
- ✅ **Version 1.3.8 checked on the iPhone** (6 Nov 2026)
  - [x] Settings › About shows 1.3.8, and the app works as before (home, a lease, a receipt PDF, Settings)
  - [x] Record a payment of 65 000 instead of 650: the app asks first; "Cancel" records nothing
  - [x] A lease with late rent and no reminder › Formal notice: a window offers the reminder first
  - [x] Settings › Automatic backup still shows "Last automatic backup" after a change
- ✅ **Versions 1.3.4 to 1.3.6 checked on the iPhone** (6 Nov 2026)
  - [x] Settings › About shows 1.3.6
  - [x] Record a payment with method "CAF / APL" and one from the tenant for the same month: the receipt says both paid and lists each payment
  - [x] A lease › Edit: the rent and charges show the amounts in force; change one, save, confirm, and the lease page shows the new amount
  - [x] A lease with nothing late › Reminder: a window explains what is due next and offers the rent call
  - [x] A lease › Edit › Start of tracking: enter an amount owed from before, save, and Reminder then works
- ✅ **Version 1.3.9 checked on the iPhone** (7 Nov 2026)
  - [x] Settings › About shows 1.3.9, and the app works as before (home, a lease, a receipt PDF, Settings)
  - [x] A lease › Departure: "Lease end" and "Keys returned on" both show; the statement counts rent up to the lease end
  - [x] Settings › Back up: the share menu opens and "Backup created" shows after saving to Files
  - [x] Settings › About: the two erase buttons and their explanations are clear
- ⏳ **Versions 1.3.10 and 1.3.11 to check on the iPhone**
  - [ ] Settings › About shows 1.3.11
  - [ ] Settings › Setup and support › "Set up the app on the user's iPhone" shows the eight steps, with the app's address in step 4
  - [ ] A lease › Edit: choose "Quarterly", save; the lease page shows "Payment: Quarterly…" with the current period
  - [ ] Record one payment of 3 months: no question; Receipt shows one line for the quarter, and its PDF says "paiement trimestriel" with the 3 months' dates
- ✅ **GitHub backup for the user's iPhone:** connected on 7 Nov 2026 to its own new private repository, with the data they had already entered. Still to do whenever convenient: the owner's phone disconnects from `locatif-sauvegarde` (test data only), then connects later as a support copy with a read-only token
- ⏳ **Legal check, done once:** have the guarantor agreement, formal notice and deposit return letter reviewed, for example by your local ADIL. Questions to ask:
  - Guarantor agreement: since 2022 (article 2297 of the Civil Code), is the handwritten statement now complete (amount in figures and words; for a joint guarantee, the acknowledgment that the landlord need not pursue the tenant first)?
  - Rent revision claimed late: which IRL value applies, the latest published on the anniversary date or the latest published on the day of the request? Today the app uses the latest available on the day you tap, so with an anniversary just before INSEE publishes, a few days' difference changes the index used. Once answered, the app can follow the rule.
  - Deposit returned late: the app adds the penalty (10% of the rent per started month) and notes that it is not due if the tenant gave no new address. Correct?

---

## Next

### 🔜 Milestone 7 · Version 1.4 · Fixes from real use
- [ ] Bugs and annoyances found on the iPhone
- [ ] Search across tenants, properties and payments
- [ ] Small wording and layout fixes

### On hold

⏸️ **Put on hold on 6 Nov 2026:** the user prefers to enter leases and payments by hand. **7 Nov 2026:** milestone 5 dropped, as the user enters their own data from scratch on their own iPhone; its plan is kept for reference. Milestone 6 stays on hold.

### ❌ Milestone 5 · Import from Gestion Locative Facile (dropped 7 Nov 2026)
Would need the CSV export files (format only, with names replaced).
Goal: no retyping of the 15 leases.
- [ ] Read the CSV files exported from immobilierloyer.com (Locataires, Contrats, Loyers et paiements, Charges et frais, Biens if offered)
- [ ] Create properties, tenants, leases (rent, charges, deposit, dates, rent index) and the payment history
- [ ] Import expenses and charges into the expense log
- [ ] A review screen before confirming: what will be created, anything that couldn't be read
- [ ] A snapshot before the import, so it can be undone in one tap
- [ ] The import runs on the iPhone: the real files never leave it
- [ ] Bring in at least the 2025 and 2026 payment and rent history (found in the review): leases already running are tracked from the current month with today's rent, so without it the 2026 tax summary and the 2025 charges reconciliation would be wrong for those leases (when entering by hand, see the tip in [Known limitations](#known-limitations-current-version))

### ⏸️ Milestone 6 · Bank import and semi-automatic follow-up
Would need a sample export from CIC and from Crédit Agricole. The generic bank import already in the app still works.
Goal: a monthly routine of about 5 minutes. Download the bank file, import it, then tap through receipts and reminders.
- [ ] Adapt column and date detection to the CIC and Crédit Agricole exports (support OFX or Excel too, if CSV isn't offered)
- [ ] Two accounts: rent can arrive at either bank, so both files are read the same way, and a transfer imported from one never doubles one from the other
- [ ] Optionally import money going out as expenses, with a suggested category
- [ ] Remember "this label always means this lease or this expense category"
- [ ] Handle the CAF paying part of the rent directly to you: receipts already say who paid (1.3.6); still to do: the CAF's monthly amount expected on rent calls, and matching CAF transfers (their label often has no tenant name) to the right lease
- [ ] **Action screen after each import** (decided 5 Nov 2026):
  - payments matched, each with "send receipt" ready
  - tenants still unpaid a set number of days after the due date (5 by default), each with "send reminder" ready
  - one tap per email (iOS rule); nothing is sent without your tap, so a wrong match never becomes a wrong receipt
  - each item marked as sent, so nothing is sent twice

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
- **Encrypted manual backup file** (from the safety review): the file saved in iCloud Drive holds all tenant data unencrypted; it could use the same passphrase as the GitHub backup
- **App lock with Face ID or a PIN** (from the safety review): anyone holding the unlocked phone can open the app
- **An automatic copy before deleting a payment or an expense** (from the safety review): today only the daily copy covers them
- **The app's own web address** (from the code review of 7 Nov 2026): every site under `hmaltawil.github.io` shares the browser's storage, so another of the owner's sites there (Deutschlernen) could read this app's data in a browser where both are opened. On the user's iPhone the home-screen app has its own storage, which limits this. A custom domain or a GitHub account used only for this app fixes it; best done early, since the user's data has to be restored from a backup after a change of address
- **The CAF's share on rent calls** (from milestone 6, on hold): when the CAF pays part of the rent directly, show what is expected from the CAF and what the tenant still pays

## Known limitations (current version)

- Data is used on one iPhone. With the GitHub backup on, it's also stored off the phone, but it's not a sync: if two phones are connected as main phone, the one that is behind stops saving and asks what to do
- If the GitHub passphrase is lost, the GitHub backups can't be read; the manual backup file isn't encrypted and still works
- Names with letters outside French and Western European alphabets are simplified in PDFs (Łukasz → Lukasz)
- Line 230 of form 2044 is entered by hand, from the managing agent's yearly statement
- The charges reconciliation assumes one tenant at a time per property (a warning shows otherwise)
- The tax summary is a guide; check it against that year's form 2044 instructions
- A lease's payment frequency applies to the whole lease, past months included (switching a lease with unpaid past months from monthly to quarterly moves their payment dates)
- Diagnostic validity rules are simplified (older DPEs have special rules); expiry dates can be edited
- Exporting to the Calendar again creates duplicate events unless the old ones are deleted first
- The bank import is generic (tuning it to CIC and Crédit Agricole is on hold with milestone 6)
- **Tip for leases entered by hand:** a lease that was already running is tracked from the month it's entered, with today's rent. For a complete tax summary of the year (and the charges reconciliation), set Edit › Start of tracking to January of that year, or earlier, and enter the payments since then (or the amount owed at that date)
