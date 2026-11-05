// PDF documents (always in French, as they are legal documents).
// Uses jsPDF, loaded from vendor/jspdf.umd.min.js.

import { fmtDate, fmtMoney, fmtPeriod, slug, todayStr } from './util.js';
import { fmtIrlKey } from './irl.js';

const M = 20; // page margin (mm)
const W = 210 - 2 * M; // usable width

function newDoc() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
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

function para(doc, y, text, size = 11) {
  doc.setFontSize(size);
  const lines = doc.splitTextToSize(text, W);
  doc.text(lines, M, y);
  return y + lines.length * size * 0.45 + 4;
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
export function rentCallPdf(state, lease, due, previousBalance) {
  const ctx = ctxFor(state, lease);
  const doc = newDoc();
  let y = header(doc, ctx);
  y = title(doc, y, "AVIS D'ÉCHÉANCE", `Loyer de ${fmtPeriod(due.period)}`);
  y = para(doc, y, `Madame, Monsieur,\n\nVeuillez trouver ci-dessous le détail du loyer et des charges dus pour la période ${periodLabel(due)}, concernant le logement situé ${propertyAddress(ctx.property)}.`);
  const rows = [
    ['Loyer hors charges', fmtMoney(due.rent)],
    [chargesLabel(lease), fmtMoney(due.charges)],
    [`Total de l'échéance`, fmtMoney(due.total), { bold: true, line: true }],
  ];
  if (previousBalance > 0) {
    rows.push(['Solde antérieur restant dû', fmtMoney(previousBalance)]);
    rows.push(['Total à payer', fmtMoney(due.total + previousBalance), { bold: true, line: true }]);
  }
  y = table(doc, y + 2, rows);
  if (due.prorata) y = para(doc, y, `Montant calculé au prorata : ${due.prorata.days} jours sur ${due.prorata.dim}.`, 10);
  y = para(doc, y, `Merci d'effectuer votre règlement au plus tard le ${fmtDate(due.dueDate)}.`);
  signature(doc, y + 6, ctx);
  footnote(doc, 'Cet avis d\'échéance ne vaut pas quittance. Il est établi sous réserve du bon encaissement du règlement.');
  return { doc, name: fileName('Avis-echeance', due.period, lease) };
}

// ---------- Quittance / reçu partiel ----------
export function receiptPdf(state, lease, row) {
  const ctx = ctxFor(state, lease, { date: row.paidDate && row.paid >= row.total ? row.paidDate : todayStr() });
  const doc = newDoc();
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
  for (const r of led.lateRows) {
    body.push({ cells: [fmtPeriod(r.period).replace(/^./, (c) => c.toUpperCase()), fmtMoney(r.total), fmtMoney(r.paid), fmtMoney(r.total - r.paid)] });
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

// Opens the iPhone share menu (Mail, Messages, Files...), or downloads.
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
