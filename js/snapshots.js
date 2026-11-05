// Rules for automatic snapshots. Pure functions, tested in tests/.
// - one "daily" snapshot per day the app is used, kept for 14 days;
// - one before each risky action (import, restore, deletion, wipe...), the 10 latest kept.

export const DAILY_KEEP_DAYS = 14;
export const EVENT_KEEP = 10;
export const TRASH_KEEP_DAYS = 15;

export function dayOf(iso) {
  return iso.slice(0, 10);
}

export function needsDaily(snaps, today) {
  return !snaps.some((s) => s.reason === 'daily' && s.day === today);
}

function daysAgo(today, n) {
  const [y, m, d] = today.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - n));
  return dt.toISOString().slice(0, 10);
}

// Returns the ids of snapshots to delete.
export function toPrune(snaps, today) {
  const limit = daysAgo(today, DAILY_KEEP_DAYS - 1);
  const out = [];
  const seenDays = new Set();
  const sorted = [...snaps].sort((a, b) => (a.at < b.at ? 1 : -1));
  let events = 0;
  for (const s of sorted) {
    if (s.reason === 'daily') {
      if (s.day < limit || seenDays.has(s.day)) out.push(s.id);
      else seenDays.add(s.day);
    } else {
      events++;
      if (events > EVENT_KEEP) out.push(s.id);
    }
  }
  return out;
}

export function counts(state) {
  return {
    p: state.properties.length,
    l: state.leases.length,
    pay: state.payments.length,
    e: state.expenses.length,
    d: state.documents.length,
  };
}

// Deleted documents whose files can now really be removed.
export function expiredTrash(trash, today) {
  const limit = daysAgo(today, TRASH_KEEP_DAYS);
  return (trash || []).filter((t) => t.deletedOn < limit);
}
