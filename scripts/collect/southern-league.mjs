// Southern League Premier South, from the league's own JSON feed: the API its fixtures page loads in the browser
// (the page is a JavaScript app, so its HTML holds no fixtures). The feed is undocumented and can change without notice.
//   - Needs the header X-TENANT-ID: sfl (the tenant id from the page's own config).
//   - Reads the Premier South competition for the page's own 60-day window, following pagination (two pages at present).
//   - Refuses partial or unexpected data, so the build falls back to the Parkway site plus BetExplorer (see build.mjs).
// FA Trophy ties for Southern League clubs come from the same API (one extra request, because the main fetch is
// limited to the Premier South competition). They are returned as a separate result for the FA Trophy section.
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
export const TROPHY_META = { id: 'sfl-trophy', name: NAME, url: SITE, postponements: true };
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

const nameOf = (m, side) => (side === 'home' ? (m.homeTeamName ?? m.homeTeam?.fullName) : (m.awayTeamName ?? m.awayTeam?.fullName));
const venueOf = m => m.venue ?? m.stadium ?? m.homeTeam?.club?.stadiumName ?? null;
const statusOf = m => (m.status === 'Postponed' || /postpone/i.test(m.externalMatchStatus ?? '') ? 'postponed' : 'scheduled');

/** League rows -> normalised Premier South fixtures. */
export function parseSouthern(items) {
  const teams = new Set();
  const fixtures = [];
  const unknownStatus = new Set();
  for (const m of items) {
    if (m.competition?.id !== COMPETITION_ID) continue;
    const home = nameOf(m, 'home'), away = nameOf(m, 'away');
    if (!m.date || !home || !away) continue;
    teams.add(home); teams.add(away);
    if (!['NotKickedOff', 'Postponed'].includes(m.status)) unknownStatus.add(`${m.status} (${home} v ${away})`);
    fixtures.push(makeFixture({
      date: m.date, time: /^\d{1,2}:\d{2}$/.test(m.time ?? '') ? m.time : null, home, away,
      venue: venueOf(m), competition: COMPETITION, status: statusOf(m), source: NAME,
    }));
  }
  return { fixtures, teams: [...teams], unknownStatus: [...unknownStatus] };
}

/** Cup rows -> FA Trophy ties for Southern League clubs (other cups are not reported). */
export function parseTrophy(items) {
  const fixtures = [];
  const teams = new Set();
  for (const m of items) {
    if (m.competition?.type !== 'cup' || !/fa trophy/i.test(`${m.competition?.name} ${m.competition?.shortName}`)) continue;
    const home = nameOf(m, 'home'), away = nameOf(m, 'away');
    if (!m.date || !home || !away) continue;
    teams.add(home); teams.add(away);
    fixtures.push(makeFixture({
      date: m.date, time: /^\d{1,2}:\d{2}$/.test(m.time ?? '') ? m.time : null, home, away,
      venue: venueOf(m), competition: 'FA Trophy', tag: 'FA Trophy', status: statusOf(m), source: NAME,
    }));
  }
  return { fixtures, teams: [...teams] };
}

/** Returns { league, trophy }: two collector results (failure results if the feed is unusable). */
export async function collect(ctx) {
  let league, trophy;
  try {
    const { fixtures, teams, unknownStatus } = parseSouthern(await fetchLeagueItems());
    const notes = unknownStatus.length ? [`The feed gave an unrecognised status for: ${unknownStatus.join('; ')}. These are shown as scheduled. Check the clubs.`] : [];
    league = result(META, { fixtures, teams, complete: true, notes });
  } catch (e) { league = failure(META, e); }
  try {
    const cups = await fetchCupTies(ctx.window);
    const { fixtures, teams } = parseTrophy(cups.items);
    const keys = new Set(teams.map(teamKey));
    trophy = result(TROPHY_META, {
      fixtures, teams, complete: false,
      notes: cups.more ? ['The Southern League cup list has a second page that was not read, so some FA Trophy ties may be missing.'] : [],
    });
    trophy.adds = true;                                                            // may contribute ties the FA page does not list
    trophy.scope = f => keys.has(teamKey(f.home)) || keys.has(teamKey(f.away));    // covers only its own clubs' ties
    trophy.partialNote = 'Southern League clubs only';
  } catch (e) { trophy = failure(TROPHY_META, e); }
  return { league, trophy };
}
