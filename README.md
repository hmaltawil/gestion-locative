# Gestion locative

A rental management web app for a private landlord in France. It works offline, can be added to an iPhone home screen, and shows its screens in French or English. The PDF documents are always in French.

## What it does (version 1)

- **Properties and leases:** tenants and co-tenants, guarantor, deposit, payment day, energy rating (DPE).
- **Rent tracking:** a month-by-month view with paid, partial, unpaid and late statuses. Payments always clear the oldest month first. First and last months are pro-rated. Already-running leases can start with an opening balance.
- **PDF documents:** rent call (avis d'échéance), rent receipt (quittance), partial payment receipt (reçu partiel), friendly reminder (relance) and formal notice (mise en demeure). They open the iPhone share menu (Mail, Messages, Files).
- **Yearly rent revision:** uses the IRL index (INSEE), based on its one-year change as required by article 17-1 of the law of 6 July 1989. It drafts a notification letter and applies the new rent from a chosen month. Properties rated F or G are blocked, and the app warns about the one-year limit for requesting a revision.
- **IRL values:** built in, with an "Update from INSEE" button.
- **Expenses:** recorded by category, with yearly totals and the matching line of tax form 2044 as a guide.
- **Signature:** drawn with a finger and added to the documents.
- **Backup and restore:** a JSON file you can save to iCloud Drive.

## Where the data lives

All data is stored on the device itself (IndexedDB) and never sent anywhere. The only network request is the optional IRL update to `bdm.insee.fr`.

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
- `js/docs.js`: the PDF documents, built with jsPDF from `vendor/` (MIT licence).
- `js/irl.js`: the built-in IRL table and the INSEE fetch.
- `js/store.js`: on-device storage, backup and restore.
- `js/i18n.js`: the French and English interface text.
- `js/app.js`: the screens.

## Legal note

The templates follow the French law of 6 July 1989 (articles 17-1 and 21). They are not legal advice: check the documents once, for example with your local ADIL.
