// Writes data/premier-south.json with the Premier South fixtures (including P-P postponements).
//   node scripts/scrape.mjs
// The weekly build (scripts/build.mjs) uses the same function, so the data file and the report share one request.
//
// Source: the JSON API that the Southern League fixtures page loads in the browser
// (api.southern-football-league.co.uk/matches, tenant "sfl"). The page itself is a
// JavaScript app, so its HTML contains no fixtures; the API is the data it renders.
//
// Requests per run: one per page of results (two at present). No retries.
//
// Failure policy: any HTTP error, a changed competition, an unknown status, a
// missing or incomplete list, or zero fixtures throws and writes NOTHING,
// so the workflow never commits an empty or partial file.
//
// Date assumption: the API's `dateTime` carries the UK local calendar date
// (its trailing "Z" is not a true UTC instant), and `time` is the local kick-off
// ("HH:MM"). So date = dateTime's date part, kick-off = `time`. The API supplies
// full dates, so no season or year is assumed.
//
// Output format (data/premier-south.json) is unchanged from the original scraper; see README.
import { writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { USER_AGENT, sleep } from './lib/http.mjs';

export const SITE = 'https://www.southern-football-league.co.uk/fixtures';
export const API = 'https://api.southern-football-league.co.uk/matches';
export const TENANT = 'sfl';                                  // tenantId from the page's own config
export const COMPETITION_ID = '69d0bd99b616bafb97331d3f';     // "Premier South" in the competitions list
export const COMPETITION_NAME = 'Premier South';
const WINDOW_DAYS = 60;                                       // the page's own "Days" window, from today
const PAGE_SIZE = 100;                                        // API maximum
const MAX_PAGES = 5;                                          // guard against runaway paging
export const OUT = 'data/premier-south.json';

// API status -> output status. Anything else stops the run rather than being guessed.
const STATUS = { NotKickedOff: 'time', Postponed: 'postponed' };

const clean = s => (s ?? '').replace(/\s+/g, ' ').trim();
const fail = msg => { throw new Error(msg); };

async function fetchPage(page) {
  const url = new URL(API);
  url.search = new URLSearchParams({
    competition: COMPETITION_ID,
    period: 'Days',
    periodLimit: String(WINDOW_DAYS),
    status: 'fixture',
    sort: 'asc',
    limit: String(PAGE_SIZE),
    page: String(page),
  });
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'X-TENANT-ID': TENANT, Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) fail(`HTTP ${res.status} from fixtures API (page ${page})`);
  return res.json();
}

/** Validates API rows and builds the data-file object. Pure, so it can be unit-tested. */
export function buildOutput(items, total, fetchedAt = new Date().toISOString()) {
  if (items.length === 0) fail(`no fixtures returned for ${COMPETITION_NAME}`);
  if (items.length !== total) fail(`received ${items.length} of ${total} matches; refusing partial data`);

  // Every match must belong to the division we asked for.
  for (const m of items) {
    if (m.competition?.name !== COMPETITION_NAME) fail(`unexpected competition "${m.competition?.name}"`);
  }

  // De-duplicate across pages by match id.
  const unique = [...new Map(items.map(m => [m.id, m])).values()];

  const fixtures = unique.map(m => {
    const status = STATUS[m.status] ?? fail(`unknown match status "${m.status}" (match ${m.id})`);
    const home = clean(m.homeTeam?.fullName) || fail(`missing home team (match ${m.id})`);
    const away = clean(m.awayTeam?.fullName) || fail(`missing away team (match ${m.id})`);
    const date = String(m.dateTime).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(`bad date "${m.dateTime}" (match ${m.id})`);
    if (m.date && m.date !== date) fail(`date mismatch "${m.date}" vs "${date}" (match ${m.id})`);
    if (status === 'time' && !/^\d{2}:\d{2}$/.test(m.time ?? '')) fail(`bad kick-off "${m.time}" (match ${m.id})`);
    return { date, home, away, status: status === 'postponed' ? 'postponed' : m.time };
  });
  if (fixtures.length === 0) fail('no fixtures after validation');

  // Raw rows as the API gave them (untrimmed names), so a parsing problem can be spotted by eye.
  const rawSection = unique.map(m => ({
    dateTime: m.dateTime,
    time: m.time ?? null,
    status: m.status,
    home: m.homeTeam?.fullName ?? null,
    away: m.awayTeam?.fullName ?? null,
  }));

  return {
    unique,
    out: {
      source: SITE,
      api: API,
      fetchedAt,
      division: COMPETITION_NAME.toUpperCase(),
      windowDays: WINDOW_DAYS,
      count: fixtures.length,
      postponed: fixtures.filter(f => f.status === 'postponed').length,
      fixtures,
      rawSection,
    },
  };
}

/** Fetches every page of Premier South fixtures. Returns the raw API rows and the data-file object. */
export async function fetchPremierSouth() {
  const items = [];
  let total = null;
  for (let page = 1; ; page++) {
    if (page > MAX_PAGES) fail(`more than ${MAX_PAGES} pages returned; refusing to continue`);
    const body = await fetchPage(page);
    if (!Array.isArray(body.items)) fail(`unexpected response shape on page ${page}`);
    total ??= body.pagination?.totalItems;
    items.push(...body.items);
    if (!body.pagination?.hasNextPage) break;
    await sleep(1000);   // be polite between pages
  }
  return buildOutput(items, total);
}

/** Write atomically so an interrupted run cannot leave a half-written file. */
export function writePremierSouthJson(out, path = OUT) {
  mkdirSync('data', { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify(out, null, 2) + '\n');
  renameSync(`${path}.tmp`, path);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { out } = await fetchPremierSouth();
    writePremierSouthJson(out);
    console.log(`Wrote ${out.count} fixtures (${out.postponed} postponed) to ${OUT}.`);
  } catch (e) {
    console.error('SCRAPE FAILED:', e.message);
    process.exit(1);
  }
}
