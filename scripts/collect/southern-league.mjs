// Southern League Premier South.
//   1. The league's own JSON feed (the one its fixtures page calls; needs the x-tenant-id header the site sends).
//   2. If that fails: the Playwright scraper (scripts/scrape.mjs), which reads the rendered page.
//   3. If that also fails: build.mjs falls back to the Parkway site plus BetExplorer.
// Cup ties (FA Trophy etc.) are included only where a Premier South club plays, and are tagged.
import { getJson } from '../lib/http.mjs';
import { makeFixture, result, failure } from '../lib/fixture.mjs';
import { isoToUk } from '../lib/time.mjs';
import { teamKey } from '../lib/teams.mjs';
import { scrapePremierSouth, PAGE_URL, writePremierSouthJson } from '../scrape.mjs';

const API = 'https://api.southern-football-league.co.uk/matches';
const PREMIER_SOUTH_ID = '69d0bd99b616bafb97331d3f';
const CUP_IDS = ['67d7c7bb74247876e6dae40e', '67d7c7bb74247876e6dae40f', '6a0adf9eda5d0d0847a024b0', '6a0adf9eda5d0d0847a0247e'];
export const COMPETITION = 'Southern League Premier South';
export const API_NAME = 'Southern League (official feed)';
export const SCRAPE_NAME = 'Southern League website (browser scrape)';
export const API_META = { id: 'sfl-api', name: API_NAME, url: API, postponements: true };
export const SCRAPE_META = { id: 'sfl-scrape', name: SCRAPE_NAME, url: PAGE_URL, postponements: true };

export function parseSouthern(json) {
  const items = json.items ?? [];
  const leagueItems = items.filter(m => m.competition?.id === PREMIER_SOUTH_ID);
  const teams = new Set(leagueItems.flatMap(m => [m.homeTeamName, m.awayTeamName]));
  const teamKeys = new Set([...teams].map(teamKey));
  const fixtures = [];
  let clockMismatch = 0;
  for (const m of items) {
    const isLeague = m.competition?.id === PREMIER_SOUTH_ID;
    const isCup = m.competition?.type === 'cup' && (teamKeys.has(teamKey(m.homeTeamName)) || teamKeys.has(teamKey(m.awayTeamName)));
    if (!isLeague && !isCup) continue;
    if (!m.date || !m.homeTeamName || !m.awayTeamName) continue;
    // `date` and `time` are the values the site displays (UK time). `dateTime` is cross-checked, never trusted over them.
    const instant = m.dateTime ? isoToUk(m.dateTime) : null;
    if (instant && m.time && (instant.date !== m.date || instant.time !== m.time)) clockMismatch++;
    const status = /postpone/i.test(m.status ?? '') || /postpone/i.test(m.externalMatchStatus ?? '') ? 'postponed' : 'scheduled';
    fixtures.push(makeFixture({
      date: m.date, time: /^\d{1,2}:\d{2}$/.test(m.time ?? '') ? m.time : null,
      home: m.homeTeamName, away: m.awayTeamName,
      venue: m.venue ?? m.stadium ?? m.homeTeam?.club?.stadiumName ?? null,
      competition: COMPETITION, tag: isLeague ? null : (m.competition?.shortName ?? m.competition?.name ?? 'Cup'),
      status, source: API_NAME,
    }));
  }
  return { fixtures, teams: [...teams], clockMismatch, hasNext: !!json.pagination?.hasNextPage };
}

async function viaApi(ctx) {
  const url = new URL(API);
  url.search = new URLSearchParams({
    period: 'Custom', startDate: ctx.window.start, endDate: ctx.window.end, sort: 'asc', status: 'fixture',
    competition: [PREMIER_SOUTH_ID, ...CUP_IDS].join(','), page: '1', limit: '100',
  });
  const json = await getJson(url.toString(), { headers: { 'x-tenant-id': 'sfl' } });
  if (!Array.isArray(json.items)) throw new Error('unexpected response shape');
  const { fixtures, teams, clockMismatch, hasNext } = parseSouthern(json);
  if (!fixtures.some(f => !f.tag)) throw new Error('feed returned no Premier South fixtures');
  const notes = [];
  if (hasNext) notes.push('The Southern League feed has a second page that was not read, so some games may be missing.');
  if (clockMismatch) notes.push(`For ${clockMismatch} fixtures the feed's date/time and its UTC timestamp disagree (possibly a BST labelling issue). The displayed date/time was used.`);
  return result(API_META, { fixtures, teams, complete: !hasNext, notes });
}

export async function collect(ctx) {
  let primary;
  try { primary = await viaApi(ctx); } catch (e) { primary = failure(API_META, e); }
  let scrape = null;
  if (!primary.ok) {
    try {
      const { fixtures, raw } = await scrapePremierSouth();
      if (!fixtures.length) throw new Error('no fixtures found in rendered page');
      scrape = result(SCRAPE_META, { fixtures, teams: [...new Set(fixtures.flatMap(f => [f.home, f.away]))], complete: true, notes: ['Browser scrape of the Southern League page was used because the JSON feed failed.'] });
      scrape.raw = raw;
    } catch (e) { scrape = failure(SCRAPE_META, e); }
  }
  const used = primary.ok ? primary : scrape;
  return { primary, scrape, used };
}

export function writeJson(path, used, via) {
  writePremierSouthJson(path, { fixtures: used.fixtures, via, source: used.url, raw: used.raw ?? [] });
}
