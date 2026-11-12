// Southern League Premier South.
//   1. The league's own JSON feed, via scripts/scrape.mjs (the feed its fixtures page loads; refuses partial data).
//      That fetch also produces data/premier-south.json, in its original documented format.
//   2. If it fails: build.mjs falls back to the Parkway site (Parkway games) plus BetExplorer (the rest).
// Cup ties (FA Trophy etc.) are included only where a Premier South club plays, and are tagged. They need one
// extra request, because the main fetch is limited to the Premier South competition.
import { getJson } from '../lib/http.mjs';
import { makeFixture, result, failure } from '../lib/fixture.mjs';
import { teamKey } from '../lib/teams.mjs';
import { fetchPremierSouth, API, TENANT, COMPETITION_ID, SITE } from '../scrape.mjs';

export const COMPETITION = 'Southern League Premier South';
export const NAME = 'Southern League (official feed)';
export const META = { id: 'sfl-api', name: NAME, url: SITE, postponements: true };
const CUP_IDS = ['67d7c7bb74247876e6dae40e', '67d7c7bb74247876e6dae40f', '6a0adf9eda5d0d0847a024b0', '6a0adf9eda5d0d0847a0247e'];

/**
 * API rows -> normalised fixtures. League rows must be Premier South; cup rows are kept only if a Premier South
 * club is playing. `date` and `time` are the UK local values the site shows (the feed's `dateTime` has a fake Z).
 */
export function parseSouthern(items) {
  const league = items.filter(m => m.competition?.id === COMPETITION_ID);
  const teams = new Set(league.flatMap(m => [m.homeTeamName ?? m.homeTeam?.fullName, m.awayTeamName ?? m.awayTeam?.fullName]).filter(Boolean));
  const keys = new Set([...teams].map(teamKey));
  const fixtures = [];
  const unknownStatus = new Set();
  for (const m of items) {
    const isLeague = m.competition?.id === COMPETITION_ID;
    const home = m.homeTeamName ?? m.homeTeam?.fullName, away = m.awayTeamName ?? m.awayTeam?.fullName;
    const isCup = m.competition?.type === 'cup' && (keys.has(teamKey(home)) || keys.has(teamKey(away)));
    if (!isLeague && !isCup) continue;
    if (!m.date || !home || !away) continue;
    const known = ['NotKickedOff', 'Postponed'];
    if (!known.includes(m.status)) unknownStatus.add(`${m.status} (${home} v ${away})`);
    fixtures.push(makeFixture({
      date: m.date, time: /^\d{1,2}:\d{2}$/.test(m.time ?? '') ? m.time : null, home, away,
      venue: m.venue ?? m.stadium ?? m.homeTeam?.club?.stadiumName ?? null,
      competition: COMPETITION, tag: isLeague ? null : (m.competition?.shortName ?? m.competition?.name ?? 'Cup'),
      status: m.status === 'Postponed' || /postpone/i.test(m.externalMatchStatus ?? '') ? 'postponed' : 'scheduled',
      source: NAME,
    }));
  }
  return { fixtures, teams: [...teams], unknownStatus: [...unknownStatus] };
}

async function fetchCupTies(window) {
  const url = new URL(API);
  url.search = new URLSearchParams({
    period: 'Custom', startDate: window.start, endDate: window.end, sort: 'asc', status: 'fixture',
    competition: CUP_IDS.join(','), page: '1', limit: '100',
  });
  const json = await getJson(url.toString(), { headers: { 'x-tenant-id': TENANT } });
  if (!Array.isArray(json.items)) throw new Error('unexpected response shape');
  return { items: json.items, more: !!json.pagination?.hasNextPage };
}

/** Returns { primary: collector result, json: data/premier-south.json contents or null }. */
export async function collect(ctx) {
  let fetched;
  try { fetched = await fetchPremierSouth(); } catch (e) { return { primary: failure(META, e), json: null }; }
  const notes = [];
  let items = fetched.unique;
  try {
    const cups = await fetchCupTies(ctx.window);
    items = [...items, ...cups.items];
    if (cups.more) notes.push('The cup-tie list has a second page that was not read, so some cup ties may be missing.');
  } catch (e) {
    notes.push(`Cup ties (FA Trophy etc.) could not be read (${e.message}), so none are shown for this section.`);
  }
  const { fixtures, teams, unknownStatus } = parseSouthern(items);
  if (unknownStatus.length) notes.push(`The feed gave an unrecognised status for: ${unknownStatus.join('; ')}. These are shown as scheduled. Check the clubs.`);
  return { primary: result(META, { fixtures, teams, complete: true, notes }), json: fetched.out };
}
