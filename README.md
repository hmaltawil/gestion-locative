# Gestion locative

A rental management web app for a private landlord in France. It works offline, can be added to an iPhone home screen, and shows its screens in French or English. The PDF documents are always in French.

What's done and what's planned: see [ROADMAP.md](ROADMAP.md).

## What it does

**Everyday**
- **Appearance:** light by default; dark or automatic (follows the iPhone) in Settings.
- **Properties and leases:** tenants and co-tenants, guarantor, deposit, payment day, energy rating (DPE), tenant insurance date.
- **Rent tracking:** a month-by-month view with paid, partial, unpaid and late statuses. Payments always clear the oldest debt first. First and last months are pro-rated. Already-running leases can start with an opening balance. One-off charges or credits can be added to a lease.
- **Monthly send:** all receipts or rent calls for a month. Each tenant's PDF goes out in one tap (their email is copied first), or everything can be saved as one PDF for printing.
- **Bank statement import:** reads the CSV export from any bank (columns are detected and can be corrected), matches incoming transfers to leases by tenant name, amount and labels seen before, and skips anything already imported.

**PDF documents (in French)**
- Rent call, receipt, partial payment receipt, reminder, formal notice.
- Rent revision letter, charges reconciliation statement, deposit return statement.
- Rent certificate (attestation de loyer), deposit receipt, guarantor agreement (acte de cautionnement).

**Yearly tasks**
- **Rent revision (IRL):** follows article 17-1 of the law of 6 July 1989. Properties rated F or G are blocked. "Update from INSEE" fetches new index values.
- **Charges reconciliation:** actual recoverable charges against the advances billed, split by days of occupancy. It drafts the letter, adds the balance to the tenant's account and can adjust the monthly advance.
- **Form 2044 summary:** rents counted when received (excluding charges), costs on lines 221 to 250 including the €20 flat fee per property, the result, and a micro-foncier comparison. Exports a PDF and a CSV file for an accountant.

**Deadlines and records**
- **Deadlines:** rent revisions, tenant insurance, diagnostic reports, lease term and notice dates, deposit return, charges reconciliation and your own reminders. Shown on the home screen and exportable to the iPhone Calendar as a .ics file.
- **Diagnostic reports:** per property, with expiry dates filled in automatically.
- **Documents:** photos and PDFs attached to properties, leases or expenses. Photos are resized, and everything is included in the backup.
- **Tenant departure:** deposit return with deductions, unpaid rent, up to 20% held back for buildings with shared accounts, the 1- or 2-month legal deadline and the late penalty.

## Where the data lives

All data, including attached documents, is stored on the device itself (IndexedDB) and never sent anywhere. Bank files are read on the phone. The only network request is the optional IRL update to `bdm.insee.fr`.

- **Back up regularly:** Settings › Back up › Save to Files › iCloud Drive. The app reminds you when the last backup is more than 7 days old.
- **Deleting the home-screen icon deletes the data.** Restore from a backup if needed.
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
```

### Files

- `js/calc.js`: rent due, payment allocation, late amounts and the IRL revision. These are pure functions, covered by the tests.
- `js/bank.js`: bank CSV parsing and payment matching.
- `js/charges.js`: charges reconciliation, deposit return, lease terms.
- `js/tax.js`: form 2044 summary and the CSV export.
- `js/deadlines.js`: deadlines and the calendar (.ics) file.
- `js/docs.js`: the PDF documents, built with jsPDF from `vendor/` (MIT licence).
- `js/irl.js`: the built-in IRL table and the INSEE fetch.
- `js/store.js`: on-device storage, backup and restore.
- `js/i18n.js`: the French and English interface text.
- `js/app.js`: the screens.

## Legal note

The templates follow the French law of 6 July 1989 (articles 17-1 and 21). They are not legal advice: check the documents once, for example with your local ADIL.
