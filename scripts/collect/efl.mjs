// EFL official match and team feeds (the JSON the efl.com site itself uses).
// One request returns the whole season; Championship and League One are split from it.
// A second request to the same service returns each club's stadium name.
import { getJson } from '../lib/http.mjs';
import { makeFixture, result, failure } from '../lib/fixture.mjs';
import { isoToUk } from '../lib/time.mjs';
import { teamKey } from '../lib/teams.mjs';

const BASE = 'https://multi-club-matches.webapi.gc.eflservices.co.uk/v2';
const SEASON = 2026;                                             // 2026/27
export const NAME = 'EFL (official feed)';
export const COMPETITIONS = { 10: 'Championship', 11: 'League One' };
const metaFor = competition => ({ id: 'efl-' + competition.toLowerCase().replace(/\W+/g, '-'), name: NAME, url: `${BASE}/matches`, postponements: true });

export async function collect(ctx = {}) {
  const fallback = ctx.config?.fallbackGrounds ?? {};
  const window = ctx.window;
  const out = {};
  let matches;
  try {
    matches = await getJson(`${BASE}/matches?competitionID=10,11,12&seasonID=${SEASON}&page.size=2000`);
    if (!Array.isArray(matches.data) || !matches.data.length) throw new Error('feed returned no matches');
  } catch (e) {
    for (const c of Object.values(COMPETITIONS)) out[c] = failure(metaFor(c), e);
    return out;
  }
  const truncated = matches.meta?.totalCount != null && matches.meta.totalCount > matches.data.length;

  const stadium = new Map();
  let stadiumNote = null;
  try {
    const teams = await getJson(`${BASE}/teams?competitionID=10,11,12&seasonID=${SEASON}`);
    for (const t of teams.data ?? []) {
      const a = t.attributes?.teams;
      if (a?.teamName && a.stadiumName) stadium.set(teamKey(a.teamName), a.stadiumName);
    }
  } catch (e) { stadiumNote = `EFL team feed failed (${e.message}); Championship and League One venues are shown as TBC.`; }

  for (const [id, competition] of Object.entries(COMPETITIONS)) {
    const meta = metaFor(competition);
    const fixtures = [];
    const names = new Set();
    const usedFallback = new Set();
    for (const m of matches.data) {
      const a = m.attributes;
      if (String(a.competitionID) !== id) continue;
      names.add(a.homeTeam.name); names.add(a.awayTeam.name);
      const uk = isoToUk(Date.parse(String(a.kickOffDateUTC).replace(' ', 'T') + 'Z'));
      if (!uk) continue;
      const venueFor = n => {
        const v = stadium.get(teamKey(n));
        if (v) return v;
        if (fallback[n]) { usedFallback.add(n); return fallback[n]; }
        return null;
      };
      fixtures.push(makeFixture({
        date: uk.date, time: a.TBC ? null : uk.time, home: a.homeTeam.name, away: a.awayTeam.name,
        venue: venueFor(a.homeTeam.name), competition,
        status: a.matchPeriod === 'Postponed' ? 'postponed' : 'scheduled', source: NAME,
      }));
    }
    const notes = [];
    if (stadiumNote) notes.push(stadiumNote);
    const inWin = new Set(fixtures.filter(f => !window || (f.date >= window.start && f.date <= window.end)).map(f => f.home));
    const used = [...usedFallback].filter(n => inWin.has(n));
    if (used.length) notes.push(`The EFL team feed lists no stadium for ${used.join(', ')}. Their grounds come from the fallback list in config/teams.json, not from a feed.`);
    if (truncated) notes.push('The EFL feed said it held more matches than it returned.');
    out[competition] = result(meta, { fixtures, teams: [...names], complete: !truncated, notes });
  }
  return out;
}
