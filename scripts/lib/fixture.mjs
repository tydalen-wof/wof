// Normalised fixture shape:
// { date: "YYYY-MM-DD", time: "HH:MM"|null, home, away, venue|null, competition, tag|null, status: "scheduled"|"postponed", sources: [] }
export function makeFixture({ date, time = null, home, away, venue = null, competition, tag = null, status = 'scheduled', source }) {
  return {
    date,
    time: time && /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, '0') : null,
    home: String(home).trim(),
    away: String(away).trim(),
    venue: venue ? String(venue).trim() : null,
    competition,
    tag: tag || null,
    status: status === 'postponed' ? 'postponed' : 'scheduled',
    sources: source ? [source] : [],
  };
}

export const POSTPONED_RE = /^\s*(p\s*-\s*p|pp|postponed|post\.?)\s*$/i;
export const looksPostponed = s => /postpone|\bp-p\b|^pp$/i.test(String(s ?? '').trim());

export function sortFixtures(list) {
  return [...list].sort((a, b) =>
    a.date.localeCompare(b.date) || (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || a.home.localeCompare(b.home));
}

/** Result every collector returns. */
export function result(meta, { fixtures = [], covers = null, complete = true, teams = null, notes = [] } = {}) {
  return { ...meta, ok: true, error: null, fixtures, covers, complete, teams, notes };
}
export function failure(meta, err) {
  return { ...meta, ok: false, error: String(err?.message ?? err), fixtures: [], covers: null, complete: false, teams: null, notes: [] };
}
