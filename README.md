# Gestion locative

A rental management web app for a private landlord in France. It works offline, can be added to an iPhone home screen, and shows its screens in French or English. The PDF documents are always in French.

What's done and what's planned: see [ROADMAP.md](ROADMAP.md). Notes for developers and AI assistants: [CLAUDE.md](CLAUDE.md).

## What it does

**Everyday**
- **Appearance:** light by default; dark or automatic (follows the iPhone) in Settings.
- **Signature:** drawn once with a finger (Settings › Signature › Add a signature, in its own window so scrolling never leaves marks) and added to receipts, rent calls and letters.
- **Properties and leases:** tenants and co-tenants, guarantor, deposit, payment day, energy rating (DPE), tenant insurance date.
- **Rent tracking:** a month-by-month view with paid, partial, unpaid and late statuses. Payments always clear the oldest debt first. First and last months are pro-rated. Already-running leases can start with an opening balance. One-off charges or credits can be added to a lease.
- **Monthly send:** all receipts or rent calls for a month. Each tenant's PDF goes out in one tap (their email is copied first), or everything can be saved as one PDF for printing.
- **Bank statement import:** reads the CSV export from any bank (columns are detected and can be corrected), matches incoming transfers to leases by tenant name, amount and labels seen before, skips anything already imported, and flags payments you already typed in by hand.

**PDF documents (in French)**
- Rent call, receipt, partial payment receipt, reminder, formal notice. Receipts say who paid each part of the rent: the tenant or the CAF (housing benefit paid directly to you).
- Rent revision letter, charges reconciliation statement, deposit return statement.
- Rent certificate (attestation de loyer), deposit receipt, guarantor agreement (acte de cautionnement).

**Yearly tasks**
- **Rent revision (IRL):** follows article 17-1 of the law of 6 July 1989. Properties rated F or G are blocked. "Update from INSEE" fetches new index values.
- **Charges reconciliation:** actual recoverable charges against the advances billed, split by days of occupancy. It drafts the letter, adds the balance to the tenant's account and can adjust the monthly advance.
- **Form 2044 summary:** rents counted when received (excluding charges), costs on lines 221 to 250 including the €20 flat fee per property and the line 230 adjustment for building charges, the result, and a micro-foncier comparison. Exports a PDF and a CSV file for an accountant.

**Deadlines and records**
- **Deadlines:** rent revisions, tenant insurance, diagnostic reports, lease term and notice dates, deposit return, charges reconciliation and your own reminders. Shown on the home screen and exportable to the iPhone Calendar as a .ics file.
- **Diagnostic reports:** per property, with expiry dates filled in automatically.
- **Documents:** photos and PDFs attached to properties, leases or expenses. Photos are resized, and everything is included in the backup.
- **Setup and support:** each device connected to the GitHub backup is either the **main phone** (saves) or a **support copy** (never saves to GitHub, for looking at the user's data; a read-only token is enough). Settings › Setup and support lists the steps to set up the user's iPhone with its own backup repository, and makes an anonymised support file.
- **Tenant departure:** the lease end (end of notice, when the rent stops) and the day the keys came back (start of the deposit deadline) are separate. Deposit return with deductions, unpaid rent, up to 20% held back for buildings with shared accounts, the 1- or 2-month legal deadline and the late penalty (added to the amount to return). Once the deposit is marked as returned, the account books the amount actually sent back: it ends at zero, at what the tenant still owes, or shows any difference.

## Where the data lives

All data, including attached documents, is stored on the device itself (IndexedDB). Bank files are read on the phone. Network requests: the optional IRL update (`bdm.insee.fr`) and, only if you turn it on, the encrypted GitHub backup (`api.github.com`).

Three layers of protection:
1. **Automatic copies on the phone** (Settings › Automatic copies): one a day for 14 days, plus one before every import, restore, deletion or erase. They undo mistakes, but they're lost with the phone.
2. **Automatic backup to GitHub** (Settings › Automatic backup): after each change, an encrypted copy goes to a **private** repository of your own. It's encrypted on the phone with AES-256-GCM and a key derived from your passphrase (PBKDF2-SHA-256, 600,000 iterations since version 1.3.9; older backups still open), so GitHub only stores unreadable files, and every version is kept. The access token and passphrase stay on the phone and are never included in backups. **Keep the passphrase on paper:** without it the backups can't be read. If another phone has saved to the same repository in the meantime, this phone stops saving and asks you what to do, so one phone never silently erases the other's changes.
3. **Manual backup file** (Settings › Manual backup › Back up › Save to Files › iCloud Drive). The app reminds you if neither this nor the GitHub backup has run for 7 days.

- **Deleting the home-screen icon deletes the data on the phone.** Restore from GitHub or from a backup file.
- **Erasing:** Settings › About › "Erase all data" can be undone (an automatic copy is kept for 14 days). "Remove everything from this device" really removes everything the app keeps on the phone, automatic copies and GitHub settings included; backup files and GitHub are not touched.
- **Safety:** the app questions likely mistakes before saving (a payment dated in the future or far above what is owed, a backdated rent increase, dates years off, fixed charges outside a flat-share, a new lease on a home rated G, a deposit returned with a different amount than the statement) and refuses what the law forbids (a backdated revision, a rent increase on a property rated F or G). Rent revisions round down to the cent, never above the legal maximum. Restored files are cleaned before use, a browser security rule only lets the app's own code run, and the GitHub backup pauses rather than replacing a much fuller version.
- **The home-screen app and Safari have separate storage.** Always open the app from its icon.

## Install on iPhone

1. Open the app's address in **Safari**: `https://hmaltawil.github.io/gestion-locative/`
2. Tap **Share** (the square with an arrow), then **Add to Home Screen**.
3. From then on, open it from the **Locatif** icon.

## Installer sur iPhone (français)

1. Ouvrez l'adresse ci-dessus dans **Safari**.
2. Touchez **Partager**, puis **Sur l'écran d'accueil**.
3. Ouvrez ensuite toujours l'app depuis l'icône **Locatif**. Les données restent sur le téléphone : pensez à faire une sauvegarde (Réglages › Sauvegarder › Enregistrer dans Fichiers).

## Publishing (GitHub Pages)

The app is a static site with no build step. To publish it, go to the repository's **Settings › Pages**, choose **Deploy from a branch**, then branch `main` and folder `/ (root)`.

**When you change a file, bump `VERSION` in `sw.js`.** Otherwise installed phones keep the old cached version. When a new version is available, phones show a "Reload" bar.

## Development

```bash
npm test          # calculation tests (Node 18+)
npm run serve     # http://localhost:8080
npm run e2e       # browser tests (Playwright), with the server running
```

### Files

- `js/calc.js`: rent due, payment allocation, late amounts and the IRL revision. These are pure functions, covered by the tests.
- `js/bank.js`: bank CSV parsing and payment matching.
- `js/checks.js`: checks on what is typed in (likely mistakes, legal limits), before it is saved.
- `js/charges.js`: charges reconciliation, deposit return, lease terms.
- `js/tax.js`: form 2044 summary and the CSV export.
- `js/deadlines.js`: deadlines and the calendar (.ics) file.
- `js/crypto.js`: encryption of the GitHub backup (Web Crypto).
- `js/sync.js`: the GitHub backup (REST API: upload, versions, restore).
- `js/snapshots.js`: rules for the automatic copies kept on the phone.
- `js/docs.js`: the PDF documents, built with jsPDF from `vendor/` (MIT licence).
- `js/irl.js`: the built-in IRL table and the INSEE fetch.
- `js/store.js`: on-device storage, backup and restore.
- `js/i18n.js`: the French and English interface text.
- `js/app.js`: the screens.

PDF documents use the fonts built into jsPDF, which cover French and Western European letters. Other letters in names are simplified (Łukasz → Lukasz).

## Legal note

The templates follow the French law of 6 July 1989 (articles 15, 17-1, 21, 22, 22-1 and 23). They are not legal advice: check the documents once, for example with your local ADIL.
