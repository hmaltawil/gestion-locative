// Anonymised copy of the data, safe to share when investigating a problem.
// Names, contact details, addresses, free-text notes, bank labels and the
// signature are replaced; amounts, dates and structure are kept, so the
// problem can be reproduced by restoring the file as a normal backup.

export function anonymize(src) {
  const s = JSON.parse(JSON.stringify(src));
  const L = s.settings.landlord || {};
  s.settings.landlord = {
    name: 'Bailleur Exemple', address: '1 rue Exemple', postalCode: L.postalCode || '', city: L.city || '',
    email: 'bailleur@example.com', phone: '',
  };
  s.settings.signature = null;

  s.properties.forEach((p, i) => {
    p.name = `Bien ${i + 1}`;
    p.address = `${i + 1} rue Exemple`;
    p.notes = '';
  });
  let tenantNo = 0;
  s.leases.forEach((l, i) => {
    l.tenants = (l.tenants || []).map(() => {
      tenantNo++;
      return { name: `Locataire ${tenantNo}`, email: `locataire${tenantNo}@example.com`, phone: '' };
    });
    if (l.guarantor) l.guarantor = `Garant ${i + 1}`;
    l.notes = '';
    if (l.departure) l.departure = { ...l.departure, newAddress: '' };
    (l.adjustments || []).forEach((a) => { if (a.kind === 'other') a.label = 'Autre somme'; });
  });
  s.payments.forEach((p) => {
    p.note = '';
    if (p.bankLabel) p.bankLabel = 'VIR LIBELLE MASQUE';
    if (p.bankRef) p.bankRef = `ref-${p.id}`;
  });
  s.expenses.forEach((e, i) => { e.description = `Dépense ${i + 1}`; });
  s.reminders.forEach((r, i) => { r.title = `Rappel ${i + 1}`; });
  s.documents.forEach((d, i) => {
    const ext = (d.name.match(/\.[A-Za-z0-9]+$/) || [''])[0];
    d.name = `document-${i + 1}${ext}`;
  });
  return { ...s, anonymised: true };
}
