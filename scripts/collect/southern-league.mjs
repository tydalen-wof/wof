// Southern League Premier South, from the league's own JSON feed: the API its fixtures page loads in the browser
// (the page is a JavaScript app, so its HTML holds no fixtures). The feed is undocumented and can change without notice.
//   - Needs the header X-TENANT-ID: sfl (the tenant id from the page's own config).
//   - Reads the Premier South competition for the page's own 60-day window, following pagination (two pages at present).
//   - Refuses partial or unexpected data, so the build falls back to the Parkway site plus BetExplorer (see build.mjs).
// Cup ties (FA Trophy etc.) are included only where a Premier South club plays, and are tagged. They need one
// extra request, because the main fetch is limited to the Premier South competition.
//
// Dates: the feed's `dateTime` carries the UK local date and time with a fake trailing "Z" (it is not a UTC instant),
// so `date` and `time` are used as given and no BST conversion is applied.
import { getJson, sleep } from '../lib/http.mjs';
import { makeFixture, result, failure } from '../lib/fixture.mjs';
import { teamKey } from '../lib/teams.mjs';

export const SITE = 'https://www.southern-football-league.co.uk/fixtures';
export const API = 'https://api.southern-football-league.co.uk/matches';
export const TENANT = 'sfl';
export const COMPETITION_ID = '69d0bd99b616bafb97331d3f';     // "Premier South" in the competitions list
export const COMPETITION_NAME = 'Premier South';
export const COMPETITION = 'Southern League Premier South';
export const NAME = 'Southern League (official feed)';
export const META = { id: 'sfl-api', name: NAME, url: SITE, postponements: true };
const WINDOW_DAYS = 60;
const PAGE_SIZE = 100;                                        // API maximum
const MAX_PAGES = 5;                                          // guard against runaway paging
const CUP_IDS = ['67d7c7bb74247876e6dae40e', '67d7c7bb74247876e6dae40f', '6a0adf9eda5d0d0847a024b0', '6a0adf9eda5d0d0847a0247e'];
const headers = { 'x-tenant-id': TENANT };

const fail = msg => { throw new Error(msg); };

/** Checks a full set of league rows. Throws (so the build falls back) rather than guess. Returns de-duplicated rows. */
export function validateLeagueItems(items, total) {
  if (items.length === 0) fail(`no fixtures returned for ${COMPETITION_NAME}`);
  if (items.length !== total) fail(`received ${items.length} of ${total} matches; refusing partial data`);
  for (const m of items) {
    if (m.competition?.name !== COMPETITION_NAME) fail(`unexpected competition "${m.competition?.name}"`);
    const date = String(m.dateTime).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(`bad date "${m.dateTime}" (match ${m.id})`);
    if (m.date && m.date !== date) fail(`date mismatch "${m.date}" vs "${date}" (match ${m.id})`);
    if (!(m.homeTeam?.fullName ?? m.homeTeamName) || !(m.awayTeam?.fullName ?? m.awayTeamName)) fail(`missing team (match ${m.id})`);
  }
  return [...new Map(items.map(m => [m.id, m])).values()];
}

async function fetchLeagueItems() {
  const items = [];
  let total = null;
  for (let page = 1; ; page++) {
    if (page > MAX_PAGES) fail(`more than ${MAX_PAGES} pages returned; refusing to continue`);
    const url = new URL(API);
    url.search = new URLSearchParams({
      competition: COMPETITION_ID, period: 'Days', periodLimit: String(WINDOW_DAYS),
      status: 'fixture', sort: 'asc', limit: String(PAGE_SIZE), page: String(page),
    });
    const body = await getJson(url.toString(), { headers });
    if (!Array.isArray(body.items)) fail(`unexpected response shape on page ${page}`);
    total ??= body.pagination?.totalItems;
    items.push(...body.items);
    if (!body.pagination?.hasNextPage) break;
    await sleep(1000);   // polite gap between pages
  }
  return validateLeagueItems(items, total);
}

async function fetchCupTies(window) {
  const url = new URL(API);
  url.search = new URLSearchParams({
    period: 'Custom', startDate: window.start, endDate: window.end, sort: 'asc', status: 'fixture',
    competition: CUP_IDS.join(','), page: '1', limit: String(PAGE_SIZE),
  });
  const json = await getJson(url.toString(), { headers });
  if (!Array.isArray(json.items)) fail('unexpected response shape');
  return { items: json.items, more: !!json.pagination?.hasNextPage };
}

/**
 * API rows -> normalised fixtures. League rows must be Premier South; cup rows are kept only if a Premier South
 * club is playing.
 */
export function parseSouthern(items) {
  const nameOf = (m, side) => (side === 'home' ? (m.homeTeamName ?? m.homeTeam?.fullName) : (m.awayTeamName ?? m.awayTeam?.fullName));
  const league = items.filter(m => m.competition?.id === COMPETITION_ID);
  const teams = new Set(league.flatMap(m => [nameOf(m, 'home'), nameOf(m, 'away')]).filter(Boolean));
  const keys = new Set([...teams].map(teamKey));
  const fixtures = [];
  const unknownStatus = new Set();
  for (const m of items) {
    const isLeague = m.competition?.id === COMPETITION_ID;
    const home = nameOf(m, 'home'), away = nameOf(m, 'away');
    const isCup = m.competition?.type === 'cup' && (keys.has(teamKey(home)) || keys.has(teamKey(away)));
    if (!isLeague && !isCup) continue;
    if (!m.date || !home || !away) continue;
    if (!['NotKickedOff', 'Postponed'].includes(m.status)) unknownStatus.add(`${m.status} (${home} v ${away})`);
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

/** Returns a collector result (a failure result if the feed is unusable). */
export async function collect(ctx) {
  let items;
  try { items = await fetchLeagueItems(); } catch (e) { return failure(META, e); }
  const notes = [];
  try {
    const cups = await fetchCupTies(ctx.window);
    items = [...items, ...cups.items];
    if (cups.more) notes.push('The cup-tie list has a second page that was not read, so some cup ties may be missing.');
  } catch (e) {
    notes.push(`Cup ties (FA Trophy etc.) could not be read (${e.message}), so none are shown for this section.`);
  }
  const { fixtures, teams, unknownStatus } = parseSouthern(items);
  if (unknownStatus.length) notes.push(`The feed gave an unrecognised status for: ${unknownStatus.join('; ')}. These are shown as scheduled. Check the clubs.`);
  return result(META, { fixtures, teams, complete: true, notes });
}
