// PDF documents (always in French, as they are legal documents).
// Uses jsPDF, loaded from vendor/jspdf.umd.min.js.

import { amountInFrench, fmtDate, fmtMoney, fmtPeriod, pdfText, slug, todayStr } from './util.js';
import { fmtIrlKey } from './irl.js';

const M = 20; // page margin (mm)
const W = 210 - 2 * M; // usable width

function newDoc() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  // Every piece of text goes through pdfText, so names with letters the PDF
  // fonts don't have are simplified instead of printed as garbage.
  const text = doc.text.bind(doc);
  doc.text = (s, ...rest) => text(Array.isArray(s) ? s.map(pdfText) : pdfText(s), ...rest);
  const split = doc.splitTextToSize.bind(doc);
  doc.splitTextToSize = (s, ...rest) => split(pdfText(s), ...rest);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(20, 20, 20);
  return doc;
}

function tenantNames(lease) {
  const names = (lease.tenants || []).map((t) => t.name).filter(Boolean);
  if (names.length <= 1) return names[0] || '';
  return names.slice(0, -1).join(', ') + ' et ' + names[names.length - 1];
}

function propertyAddress(property) {
  if (!property) return '';
  const city = [property.postalCode, property.city].filter(Boolean).join(' ');
  return [property.address, city].filter(Boolean).join(', ');
}

function propertyLines(property) {
  if (!property) return [];
  const city = [property.postalCode, property.city].filter(Boolean).join(' ');
  return [property.address, city].filter(Boolean);
}

// Landlord top-left, tenant top-right, place and date below.
function header(doc, ctx) {
  const L = ctx.landlord;
  doc.setFontSize(10);
  let y = M;
  doc.setFont('helvetica', 'bold');
  doc.text(L.name || 'Bailleur', M, y);
  doc.setFont('helvetica', 'normal');
  const lLines = [L.address, [L.postalCode, L.city].filter(Boolean).join(' '), L.phone, L.email].filter(Boolean);
  for (const line of lLines) { y += 5; doc.text(line, M, y); }

  let ty = M + 22;
  const tx = 115;
  doc.setFont('helvetica', 'bold');
  const names = doc.splitTextToSize(tenantNames(ctx.lease) || 'Locataire', 210 - M - tx);
  doc.text(names, tx, ty);
  ty += 5 * names.length;
  doc.setFont('helvetica', 'normal');
  for (const line of propertyLines(ctx.property)) { doc.text(line, tx, ty); ty += 5; }

  y = Math.max(y, ty) + 8;
  doc.text(`${L.city ? 'À ' + L.city + ', le' : 'Le'} ${fmtDate(ctx.date || todayStr())}`, 210 - M, y, { align: 'right' });
  return y + 12;
}

function title(doc, y, text, sub) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(text, 105, y, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  if (sub) {
    doc.setFontSize(11);
    doc.text(sub, 105, y + 7, { align: 'center' });
    return y + 17;
  }
  return y + 11;
}

function subject(doc, y, text) {
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(text, M, y);
  doc.setFont('helvetica', 'normal');
  return y + 10;
}

// Wrapped paragraph that continues on a new page when needed.
function para(doc, y, text, size = 11) {
  doc.setFontSize(size);
  const lh = size * 0.43;
  for (const line of doc.splitTextToSize(text, W)) {
    if (y > 282) { doc.addPage(); y = M + 4; doc.setFontSize(size); }
    doc.text(line, M, y);
    y += lh;
  }
  return y + 4;
}

// rows: [label, amount, { bold }]
function table(doc, y, rows) {
  doc.setFontSize(11);
  const x2 = 210 - M;
  doc.setDrawColor(200, 200, 200);
  for (const [label, value, opt = {}] of rows) {
    if (opt.line) { doc.line(M, y - 4, x2, y - 4); }
    doc.setFont('helvetica', opt.bold ? 'bold' : 'normal');
    const lines = doc.splitTextToSize(label, W - 45);
    doc.text(lines, M + 2, y);
    if (value !== undefined && value !== null) doc.text(String(value), x2 - 2, y, { align: 'right' });
    y += 6.5 * lines.length;
  }
  doc.setFont('helvetica', 'normal');
  return y + 4;
}

// columns table for unpaid months
function grid(doc, y, head, body) {
  doc.setFontSize(10);
  const cols = [M + 2, 95, 130, 210 - M - 2];
  doc.setFillColor(242, 242, 242);
  doc.rect(M, y - 5, W, 8, 'F');
  doc.setFont('helvetica', 'bold');
  head.forEach((h, i) => doc.text(h, cols[i], y, i === 0 ? {} : { align: 'right' }));
  doc.setFont('helvetica', 'normal');
  y += 8;
  for (const row of body) {
    if (row.bold) doc.setFont('helvetica', 'bold');
    row.cells.forEach((c, i) => doc.text(String(c), cols[i], y, i === 0 ? {} : { align: 'right' }));
    doc.setFont('helvetica', 'normal');
    y += 6.5;
  }
  return y + 4;
}

function signature(doc, y, ctx) {
  if (y > 240) { doc.addPage(); y = M + 10; }
  doc.setFontSize(11);
  doc.text('Le bailleur', 130, y);
  if (ctx.signature) {
    try { doc.addImage(ctx.signature, 'PNG', 128, y + 2, 50, 20); } catch (e) { /* ignore bad image */ }
  }
  doc.text(ctx.landlord.name || '', 130, y + 28);
  return y + 34;
}

function footnote(doc, text) {
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  const lines = doc.splitTextToSize(text, W);
  doc.text(lines, M, 297 - 14 - (lines.length - 1) * 3.5);
  doc.setTextColor(20, 20, 20);
}

function periodLabel(row) {
  return `du ${fmtDate(row.fromDate)} au ${fmtDate(row.toDate)}`;
}

function chargesLabel(lease) {
  return lease.chargesType === 'forfait' ? 'Charges (forfait)' : 'Provision pour charges';
}

function fileName(kind, period, lease) {
  const who = slug((lease.tenants && lease.tenants[0] && lease.tenants[0].name) || 'locataire');
  return `${kind}_${period}_${who}.pdf`;
}

function ctxFor(state, lease, extra = {}) {
  return {
    lease,
    property: state.properties.find((p) => p.id === lease.propertyId),
    landlord: state.settings.landlord,
    signature: state.settings.signature,
    ...extra,
  };
}

// ---------- Avis d'échéance (rent call) ----------
// call: from rentCallBalance() in calc.js.
export function rentCallPdf(state, lease, call, into) {
  const { due } = call;
  const ctx = ctxFor(state, lease);
  const doc = into || newDoc();
  let y = header(doc, ctx);
  y = title(doc, y, "AVIS D'ÉCHÉANCE", `Loyer de ${fmtPeriod(due.period)}`);
  y = para(doc, y, `Madame, Monsieur,\n\nVeuillez trouver ci-dessous le détail du loyer et des charges dus pour la période ${periodLabel(due)}, concernant le logement situé ${propertyAddress(ctx.property)}.`);
  const rows = [
    ['Loyer hors charges', fmtMoney(due.rent)],
    [chargesLabel(lease), fmtMoney(due.charges)],
    [`Total de l'échéance`, fmtMoney(due.total), { bold: true, line: true }],
  ];
  const more = [];
  if (call.paidTowards > 0) more.push(['Déjà réglé pour cette période', `- ${fmtMoney(call.paidTowards)}`]);
  if (call.previous > 0) more.push(['Solde antérieur restant dû', fmtMoney(call.previous)]);
  for (const x of call.extras || []) more.push([`${x.label || 'Autre somme due'} (échéance du ${fmtDate(x.date)})`, fmtMoney(x.amount)]);
  if (call.credit > 0) more.push(['Avance déjà versée', `- ${fmtMoney(call.credit)}`]);
  if (more.length) rows.push(...more, ['Total à payer', fmtMoney(call.total), { bold: true, line: true }]);
  y = table(doc, y + 2, rows);
  if (due.prorata) y = para(doc, y, `Montant calculé au prorata : ${due.prorata.days} jours sur ${due.prorata.dim}.`, 10);
  y = para(doc, y, `Merci d'effectuer votre règlement au plus tard le ${fmtDate(due.dueDate)}.`);
  signature(doc, y + 6, ctx);
  footnote(doc, 'Cet avis d\'échéance ne vaut pas quittance. Il est établi sous réserve du bon encaissement du règlement.');
  return { doc, name: fileName('Avis-echeance', due.period, lease) };
}

// ---------- Quittance / reçu partiel ----------
export function receiptPdf(state, lease, row, into) {
  const ctx = ctxFor(state, lease, { date: row.paidDate && row.paid >= row.total ? row.paidDate : todayStr() });
  const doc = into || newDoc();
  const full = row.paid >= row.total;
  const L = ctx.landlord;
  let y = header(doc, ctx);
  if (full) {
    y = title(doc, y, 'QUITTANCE DE LOYER', `Période ${periodLabel(row)}`);
    y = para(doc, y, `Je soussigné(e) ${L.name || '[nom du bailleur]'}, bailleur du logement situé ${propertyAddress(ctx.property)}, déclare avoir reçu de ${tenantNames(lease)} la somme de ${fmtMoney(row.total)} au titre du paiement du loyer et des charges pour la période ${periodLabel(row)}, et lui en donne quittance, sous réserve de tous mes droits.`);
    y = table(doc, y + 2, [
      ['Loyer hors charges', fmtMoney(row.rent)],
      [chargesLabel(lease), fmtMoney(row.charges)],
      ['Total reçu', fmtMoney(row.total), { bold: true, line: true }],
    ]);
    if (row.paidDate) y = para(doc, y, `Paiement reçu le ${fmtDate(row.paidDate)}.`);
    signature(doc, y + 6, ctx);
    footnote(doc, 'Quittance délivrée gratuitement (article 21 de la loi n° 89-462 du 6 juillet 1989). Elle annule tout reçu établi précédemment pour un paiement partiel de cette période.');
    return { doc, name: fileName('Quittance', row.period, lease) };
  }
  y = title(doc, y, 'REÇU DE PAIEMENT PARTIEL', `Période ${periodLabel(row)}`);
  y = para(doc, y, `Je soussigné(e) ${L.name || '[nom du bailleur]'}, bailleur du logement situé ${propertyAddress(ctx.property)}, déclare avoir reçu de ${tenantNames(lease)} la somme de ${fmtMoney(row.paid)} en paiement partiel du loyer et des charges de la période ${periodLabel(row)}.`);
  y = table(doc, y + 2, [
    ['Loyer hors charges', fmtMoney(row.rent)],
    [chargesLabel(lease), fmtMoney(row.charges)],
    ['Total dû pour la période', fmtMoney(row.total), { bold: true, line: true }],
    ['Montant reçu', fmtMoney(row.paid)],
    ['Reste dû', fmtMoney(row.total - row.paid), { bold: true }],
  ]);
  signature(doc, y + 6, ctx);
  footnote(doc, 'Ce reçu ne vaut pas quittance (article 21 de la loi n° 89-462 du 6 juillet 1989). Une quittance sera délivrée après paiement intégral.');
  return { doc, name: fileName('Recu-partiel', row.period, lease) };
}

function arrearsRows(led) {
  const body = [];
  if (led.opening && led.opening.total - led.opening.paid > 0) {
    body.push({ cells: ['Solde antérieur', fmtMoney(led.opening.total), fmtMoney(led.opening.paid), fmtMoney(led.opening.total - led.opening.paid)] });
  }
  for (const r of led.lateItems || led.lateRows) {
    if (r.kind === 'opening') continue;
    const label = r.kind === 'adjustment' ? `${r.label || 'Autre somme'} (${fmtDate(r.dueDate)})` : fmtPeriod(r.period).replace(/^./, (c) => c.toUpperCase());
    body.push({ cells: [label.length > 40 ? label.slice(0, 39) + '…' : label, fmtMoney(r.total), fmtMoney(r.paid), fmtMoney(r.total - r.paid)] });
  }
  body.push({ bold: true, cells: ['Total restant dû', '', '', fmtMoney(led.overdue)] });
  return body;
}

// ---------- Relance amiable ----------
export function reminderPdf(state, lease, led) {
  const ctx = ctxFor(state, lease);
  const doc = newDoc();
  let y = header(doc, ctx);
  y = subject(doc, y, 'Objet : rappel de loyer impayé');
  y = para(doc, y, `Madame, Monsieur,\n\nSauf erreur de ma part, je n'ai pas reçu à ce jour le règlement des sommes suivantes, dues au titre du logement situé ${propertyAddress(ctx.property)} :`);
  y = grid(doc, y + 2, ['Période', 'Dû', 'Payé', 'Reste dû'], arrearsRows(led));
  y = para(doc, y, `Il s'agit peut-être d'un simple oubli. Je vous remercie de bien vouloir régulariser cette situation dans les meilleurs délais. Si vous avez effectué ce règlement entre-temps, merci de ne pas tenir compte de ce courrier.\n\nJe vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.`);
  signature(doc, y + 6, ctx);
  return { doc, name: fileName('Relance', todayStr().slice(0, 7), lease) };
}

// ---------- Mise en demeure ----------
export function formalNoticePdf(state, lease, led) {
  const ctx = ctxFor(state, lease);
  const doc = newDoc();
  let y = header(doc, ctx);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('LETTRE RECOMMANDÉE AVEC ACCUSÉ DE RÉCEPTION', M, y);
  y += 8;
  y = subject(doc, y, 'Objet : mise en demeure de payer');
  y = para(doc, y, `Madame, Monsieur,\n\nMalgré mes précédentes relances, je constate qu'à ce jour vous restez redevable de la somme de ${fmtMoney(led.overdue)} au titre des loyers et charges impayés du logement situé ${propertyAddress(ctx.property)}, selon le détail suivant :`);
  y = grid(doc, y + 2, ['Période', 'Dû', 'Payé', 'Reste dû'], arrearsRows(led));
  y = para(doc, y, `Par la présente, je vous mets en demeure de me régler cette somme dans un délai de huit jours à compter de la réception de ce courrier.\n\nÀ défaut de paiement dans ce délai, je me verrai contraint(e) d'engager toute procédure utile au recouvrement de ma créance, notamment par l'intermédiaire d'un commissaire de justice, et de faire application, le cas échéant, de la clause résolutoire prévue au bail.\n\nJe vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.`);
  y = signature(doc, y + 6, ctx);
  if (lease.guarantor) {
    doc.setFontSize(10);
    doc.text(`Copie adressée à la caution : ${lease.guarantor}`, M, Math.min(y, 275));
  }
  return { doc, name: fileName('Mise-en-demeure', todayStr().slice(0, 7), lease) };
}

// ---------- Révision annuelle du loyer ----------
export function indexationPdf(state, lease, info, applyFrom) {
  const ctx = ctxFor(state, lease);
  const doc = newDoc();
  let y = header(doc, ctx);
  y = subject(doc, y, 'Objet : révision annuelle du loyer');
  y = para(doc, y, `Madame, Monsieur,\n\nConformément à la clause de révision prévue dans votre bail et à l'article 17-1 de la loi n° 89-462 du 6 juillet 1989, le loyer du logement situé ${propertyAddress(ctx.property)} est révisé chaque année à sa date anniversaire (${fmtDate(info.anniversary)}), selon la variation annuelle de l'Indice de Référence des Loyers (IRL) publié par l'INSEE.`);
  const v = (n) => n.toFixed(2).replace('.', ',');
  y = table(doc, y + 2, [
    ['Loyer actuel hors charges', fmtMoney(info.currentRent)],
    [`IRL du ${fmtIrlKey(info.oldKey)}`, v(info.oldValue)],
    [`IRL du ${fmtIrlKey(info.newKey)}`, v(info.newValue)],
    [`Calcul : ${fmtMoney(info.currentRent)} × ${v(info.newValue)} / ${v(info.oldValue)}`, null],
    ['Nouveau loyer hors charges', fmtMoney(info.newRent), { bold: true, line: true }],
    ['Variation', `${info.pct >= 0 ? '+' : ''}${info.pct.toFixed(2).replace('.', ',')} %`],
  ]);
  y = para(doc, y, `Ce nouveau loyer, auquel s'ajoutent les charges de ${fmtMoney(info.charges)}, soit un total mensuel de ${fmtMoney(info.newRent + info.charges)}, s'appliquera à compter de l'échéance de ${fmtPeriod(applyFrom)}.\n\nJe vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.`);
  signature(doc, y + 6, ctx);
  return { doc, name: fileName('Revision-loyer', applyFrom, lease) };
}

// ---------- Régularisation annuelle des charges ----------
export function regularizationPdf(state, lease, reg, lines, opts = {}) {
  const ctx = ctxFor(state, lease);
  const doc = newDoc();
  let y = header(doc, ctx);
  y = subject(doc, y, `Objet : régularisation annuelle des charges, année ${reg.year}`);
  y = para(doc, y, `Madame, Monsieur,\n\nConformément à l'article 23 de la loi n° 89-462 du 6 juillet 1989, veuillez trouver ci-dessous le décompte, par nature, des charges récupérables de l'année ${reg.year} pour le logement situé ${propertyAddress(ctx.property)}.`);
  y = table(doc, y + 2, [
    ...lines.map((l) => [l.label, fmtMoney(l.amount)]),
    ['Total des charges récupérables', fmtMoney(reg.actualTotal), { bold: true, line: true }],
  ]);
  const rows = [];
  if (reg.share < 1) rows.push([`Votre quote-part (${reg.days} jours d'occupation sur ${reg.yearDays})`, fmtMoney(reg.tenantShare)]);
  rows.push([`Provisions pour charges appelées en ${reg.year}`, fmtMoney(reg.provisions)]);
  if (reg.balance > 0) rows.push(['Solde restant à votre charge', fmtMoney(reg.balance), { bold: true, line: true }]);
  else if (reg.balance < 0) rows.push(['Trop-perçu en votre faveur', fmtMoney(-reg.balance), { bold: true, line: true }]);
  else rows.push(['Solde', fmtMoney(0), { bold: true, line: true }]);
  y = table(doc, y, rows);
  let text = '';
  if (reg.balance > 0) text += `Je vous remercie de bien vouloir régler ce solde de ${fmtMoney(reg.balance)} avec votre échéance${opts.dueDate ? ` du ${fmtDate(opts.dueDate)}` : ''}. `;
  else if (reg.balance < 0) text += `Ce trop-perçu de ${fmtMoney(-reg.balance)} sera déduit de votre prochaine échéance. `;
  if (opts.newMonthly !== undefined && opts.newMonthly !== null && opts.newFrom) {
    text += `\n\nÀ compter de l'échéance de ${fmtPeriod(opts.newFrom)}, la provision mensuelle pour charges est ajustée à ${fmtMoney(opts.newMonthly)}.`;
  }
  text += `\n\nLes pièces justificatives sont tenues à votre disposition pendant six mois à compter de l'envoi de ce décompte.\n\nJe vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.`;
  y = para(doc, y, text.trim());
  signature(doc, y + 6, ctx);
  return { doc, name: fileName('Regularisation-charges', String(reg.year), lease) };
}

// ---------- Restitution du dépôt de garantie ----------
export function departurePdf(state, lease, st, dep) {
  const ctx = ctxFor(state, lease);
  const doc = newDoc();
  let y = header(doc, ctx);
  y = title(doc, y, 'RESTITUTION DU DÉPÔT DE GARANTIE', 'Décompte de sortie');
  y = para(doc, y, `Madame, Monsieur,\n\nSuite à votre départ du logement situé ${propertyAddress(ctx.property)}, dont les clés m'ont été remises le ${fmtDate(st.keysDate)}, veuillez trouver ci-dessous le décompte de restitution de votre dépôt de garantie.`);
  const rows = [['Dépôt de garantie versé', fmtMoney(st.deposit)]];
  if (st.credit > 0) rows.push(['Trop-perçu sur loyers et charges', `+ ${fmtMoney(st.credit)}`]);
  if (st.arrears > 0) rows.push(['Loyers et charges restant dus', `- ${fmtMoney(st.arrears)}`]);
  for (const d of dep.deductions || []) if (d.amount) rows.push([d.label || 'Retenue', `- ${fmtMoney(d.amount)}`]);
  if (st.retention > 0) rows.push(["Provision conservée dans l'attente de l'arrêté des comptes de l'immeuble", `- ${fmtMoney(st.retention)}`]);
  if (st.penalty > 0) rows.push([`Majoration pour restitution tardive (${st.lateMonths} mois commencé${st.lateMonths > 1 ? 's' : ''} de retard)`, `+ ${fmtMoney(st.penalty)}`]);
  if (st.stillOwed > 0) rows.push(['Reste dû par le locataire', fmtMoney(st.stillOwed), { bold: true, line: true }]);
  else rows.push(['Montant restitué', fmtMoney(st.toReturn), { bold: true, line: true }]);
  y = table(doc, y + 2, rows);
  let text = dep.inventoryMatches !== false
    ? "L'état des lieux de sortie étant conforme à l'état des lieux d'entrée, le dépôt de garantie est restitué dans un délai d'un mois à compter de la remise des clés."
    : "Les retenues ci-dessus correspondent aux différences constatées entre l'état des lieux d'entrée et l'état des lieux de sortie ; les justificatifs (devis, factures) sont joints. Le dépôt de garantie est restitué dans un délai de deux mois à compter de la remise des clés.";
  if (st.penalty > 0) text += "\n\nLe dépôt étant restitué après le délai légal, le montant restitué comprend la majoration de 10 % du loyer mensuel hors charges par mois de retard commencé prévue par l'article 22.";
  if (st.retention > 0) text += "\n\nLe solde de la provision conservée vous sera restitué dans le mois qui suit l'approbation définitive des comptes de l'immeuble.";
  if (st.stillOwed > 0) text += `\n\nLe dépôt de garantie ne couvrant pas l'intégralité des sommes dues, vous restez redevable de ${fmtMoney(st.stillOwed)}, que je vous remercie de régler dans les meilleurs délais.`;
  if (dep.newAddress) text += `\n\nAdresse communiquée pour la restitution : ${dep.newAddress}.`;
  text += "\n\nJe vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.";
  y = para(doc, y, text);
  signature(doc, y + 6, ctx);
  footnote(doc, 'Article 22 de la loi n° 89-462 du 6 juillet 1989.');
  return { doc, name: fileName('Restitution-depot', (lease.endDate || todayStr()).slice(0, 7), lease) };
}

// ---------- Attestation de loyer ----------
export function rentCertificatePdf(state, lease, cur, opts = {}) {
  const ctx = ctxFor(state, lease);
  const doc = newDoc();
  const L = ctx.landlord;
  let y = header(doc, ctx);
  y = title(doc, y, 'ATTESTATION DE LOYER');
  let text = `Je soussigné(e) ${L.name || '[nom du bailleur]'}, propriétaire du logement situé ${propertyAddress(ctx.property)}, atteste que ${tenantNames(lease)} occupe ce logement en qualité de locataire depuis le ${fmtDate(lease.startDate)}, en vertu d'un bail d'habitation (location vide, résidence principale).\n\nLe loyer mensuel s'élève à ${fmtMoney(cur.rent)} hors charges, auquel s'ajoutent ${fmtMoney(cur.charges)} de ${lease.chargesType === 'forfait' ? 'charges forfaitaires' : 'provision pour charges'}, soit un total de ${fmtMoney(cur.rent + cur.charges)} par mois.`;
  if (opts.upToDate) text += `\n\nÀ la date du ${fmtDate(todayStr())}, le locataire est à jour du paiement de ses loyers et charges.`;
  text += '\n\nAttestation établie pour servir et valoir ce que de droit.';
  y = para(doc, y, text);
  signature(doc, y + 8, ctx);
  return { doc, name: fileName('Attestation-loyer', todayStr().slice(0, 7), lease) };
}

// ---------- Reçu de dépôt de garantie ----------
export function depositReceiptPdf(state, lease, opts = {}) {
  const ctx = ctxFor(state, lease, { date: opts.date || lease.startDate });
  const doc = newDoc();
  const L = ctx.landlord;
  let y = header(doc, ctx);
  y = title(doc, y, 'REÇU DE DÉPÔT DE GARANTIE');
  y = para(doc, y, `Je soussigné(e) ${L.name || '[nom du bailleur]'}, bailleur du logement situé ${propertyAddress(ctx.property)}, déclare avoir reçu de ${tenantNames(lease)} la somme de ${fmtMoney(lease.deposit || 0)} (${amountInFrench(lease.deposit || 0)}) à titre de dépôt de garantie, conformément au bail prenant effet le ${fmtDate(lease.startDate)}.\n\nCette somme, qui ne produit pas d'intérêts, sera restituée dans les conditions prévues par l'article 22 de la loi n° 89-462 du 6 juillet 1989 : dans un délai d'un mois à compter de la remise des clés si l'état des lieux de sortie est conforme à l'état des lieux d'entrée, de deux mois dans le cas contraire, déduction faite le cas échéant des sommes restant dues et justifiées.`);
  signature(doc, y + 8, ctx);
  return { doc, name: fileName('Recu-depot-garantie', lease.startDate.slice(0, 7), lease) };
}

// ---------- Acte de cautionnement ----------
// g: { name, address, solidaire, years (null = indéterminée), maxAmount }
export function guarantorPdf(state, lease, g, cur) {
  const ctx = ctxFor(state, lease);
  const doc = newDoc();
  const L = ctx.landlord;
  const tenants = tenantNames(lease);
  const kind = g.solidaire ? 'solidaire' : 'simple';
  const duration = g.years ? `${g.years} an${g.years > 1 ? 's' : ''} à compter de la signature du présent acte` : 'une durée indéterminée';
  let y = M;
  y = title(doc, y + 4, 'ACTE DE CAUTIONNEMENT', `Caution ${kind} – bail d'habitation (loi n° 89-462 du 6 juillet 1989)`);
  y = table(doc, y, [
    ['Bailleur', L.name || ''],
    ['Caution', g.name || ''],
    ['Locataire(s)', tenants],
    ['Logement', propertyAddress(ctx.property)],
    ['Date de prise d\'effet du bail', fmtDate(lease.startDate)],
    ['Loyer mensuel hors charges', fmtMoney(cur.rent)],
    [lease.chargesType === 'forfait' ? 'Charges (forfait)' : 'Provision pour charges', fmtMoney(cur.charges)],
  ]);
  const revision = lease.irl && lease.irl.quarter
    ? `Le loyer est révisable chaque année à la date anniversaire du bail, selon la variation annuelle de l'Indice de Référence des Loyers publié par l'INSEE, l'indice de référence étant celui du ${lease.irl.quarter}${lease.irl.quarter === 1 ? 'er' : 'e'} trimestre.`
    : 'Le bail ne prévoit pas de révision annuelle du loyer.';
  y = para(doc, y, `Je soussigné(e) ${g.name || '[nom de la caution]'}${g.address ? `, demeurant ${g.address}` : ''}, déclare me porter caution ${kind} de ${tenants} pour le paiement des loyers, des charges, des réparations locatives et, le cas échéant, des indemnités d'occupation, frais et accessoires dus au titre du bail désigné ci-dessus, conclu avec ${L.name || '[nom du bailleur]'}.\n\n${revision}\n\nMon engagement est consenti pour ${duration}, dans la limite de la somme de ${fmtMoney(g.maxAmount)} (${amountInFrench(g.maxAmount)}).${g.solidaire ? " En me portant caution solidaire, je renonce au bénéfice de discussion : le bailleur pourra me demander le paiement des sommes dues sans poursuivre d'abord le locataire." : ''}\n\nJe reconnais avoir une parfaite connaissance de la nature et de l'étendue de mon engagement et avoir reçu un exemplaire du contrat de location.`, 10.5);
  y = para(doc, y, "Reproduction de l'avant-dernier alinéa de l'article 22-1 de la loi du 6 juillet 1989 : « Lorsque le cautionnement d'obligations résultant d'un contrat de location conclu en application du présent titre ne comporte aucune indication de durée ou lorsque la durée du cautionnement est stipulée indéterminée, la caution peut le résilier unilatéralement. La résiliation prend effet au terme du contrat de location, qu'il s'agisse du contrat initial ou d'un contrat reconduit ou renouvelé, au cours duquel le bailleur reçoit notification de la résiliation. »", 9.5);
  // Article 2297 of the Civil Code: the amount in words and in figures, and,
  // for a joint guarantee, the guarantor's acknowledgment in the statement itself.
  const renounce = g.solidaire
    ? " Je reconnais ne pouvoir exiger du bailleur qu'il poursuive d'abord le locataire ni, en cas de pluralité de cautions, qu'il divise ses poursuites entre les cautions."
    : '';
  const mention = `« En me portant caution ${kind} de ${tenants}, dans la limite de la somme de ${fmtMoney(g.maxAmount)} (${amountInFrench(g.maxAmount)}) couvrant le paiement des loyers, charges et accessoires et pour ${g.years ? `une durée de ${g.years} an${g.years > 1 ? 's' : ''}` : 'une durée indéterminée'}, je m'engage à payer au bailleur ce que lui doit le locataire en cas de défaillance de celui-ci.${renounce} »`;
  // Handwriting takes more room than print: leave enough lines.
  const writeLines = g.solidaire ? 8 : 6;
  // Keep the statement, the lines to write on and the signatures on one page.
  doc.setFontSize(9.5);
  const needed = 5 + doc.splitTextToSize(mention, W).length * 4.1 + 4 + writeLines * 7 + 3 + 34;
  if (y + needed > 287) {
    // The first page is initialled by both parties.
    doc.setFontSize(9);
    doc.text('Paraphe de la caution :', M, 285);
    doc.text('Paraphe du bailleur :', 130, 285);
    doc.addPage();
    y = M + 6;
  }
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Mention à écrire par la caution elle-même :', M, y);
  doc.setFont('helvetica', 'normal');
  y += 5;
  y = para(doc, y, mention, 9.5);
  doc.setDrawColor(170, 170, 170);
  for (let i = 0; i < writeLines; i++) { doc.line(M, y + 2 + i * 7, 210 - M, y + 2 + i * 7); }
  y += writeLines * 7 + 3;
  doc.setFontSize(10.5);
  doc.text(`Fait à ${L.city || '……………'}, le ……………, en deux exemplaires.`, M, y);
  doc.text('La caution', M, y + 10);
  doc.text('Le bailleur', 130, y + 10);
  if (ctx.signature) { try { doc.addImage(ctx.signature, 'PNG', 128, y + 12, 50, 20); } catch (e) { /* ignore */ } }
  return { doc, name: fileName('Acte-cautionnement', lease.startDate.slice(0, 7), lease) };
}

// ---------- Aide à la déclaration 2044 ----------
export function taxSummaryPdf(state, s, labels) {
  const doc = newDoc();
  const L = state.settings.landlord;
  let y = M;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(L.name || '', M, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`Établi le ${fmtDate(todayStr())}`, 210 - M, y, { align: 'right' });
  y = title(doc, y + 14, `REVENUS FONCIERS ${s.year}`, 'Aide à la déclaration 2044 (location nue, régime réel)');
  y = grid(doc, y, ['Bien', 'Loyers encaissés', 'Charges', 'Frais (221-229)'], s.properties.map((p) => ({
    cells: [(p.property.name || p.property.address || '').slice(0, 38), fmtMoney(p.rent), fmtMoney(p.charges),
      fmtMoney(Object.entries(p.lines).filter(([k]) => k !== '250').reduce((a, [, v]) => a + v, 0))],
  })));
  const rows = [
    ['211 - Loyers bruts encaissés (hors charges)', fmtMoney(s.lines['211'] || 0), { bold: true }],
  ];
  for (const k of ['221', '222', '223', '224', '227', '229']) if (s.lines[k]) rows.push([`${k} - ${labels[k]}`, fmtMoney(s.lines[k])]);
  if (s.lines['230']) rows.push([`230 - ${labels['230']} (à déduire)`, `- ${fmtMoney(s.lines['230'])}`]);
  rows.push(['240 - Total des frais et charges', fmtMoney(s.expenses), { bold: true, line: true }]);
  if (s.lines['250']) rows.push([`250 - ${labels['250']}`, fmtMoney(s.lines['250'])]);
  rows.push([s.result >= 0 ? 'Résultat foncier (bénéfice)' : 'Résultat foncier (déficit)', fmtMoney(s.result), { bold: true, line: true }]);
  y = table(doc, y, rows);
  let text = `Pour comparaison, micro-foncier : ${s.microEligible ? `revenu imposable de ${fmtMoney(s.microTaxable)} (abattement de 30 %).` : 'non applicable, les loyers bruts dépassant 15 000 €.'}`;
  if (s.notDeductible) text += `\nDépenses non déductibles enregistrées (charges récupérables, TEOM, autres) : ${fmtMoney(s.notDeductible)}.`;
  y = para(doc, y, text, 10);
  footnote(doc, "Document indicatif établi à partir des données saisies. Les loyers sont comptés à leur date d'encaissement, hors charges. Vérifiez chaque ligne avec la notice 2044 de l'année (ligne 230 d'après le décompte du syndic, déficit foncier, régimes particuliers).");
  return { doc, name: `Revenus-fonciers-${s.year}.pdf` };
}

// Opens the iPhone share menu (Mail, Messages, Files...), or downloads.
export function newPdf() {
  return newDoc();
}

export async function deliver({ doc, name }) {
  const blob = doc.output('blob');
  return shareFile(blob, name, 'application/pdf');
}

export async function shareFile(blob, name, type) {
  const file = new File([blob], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'downloaded';
}
