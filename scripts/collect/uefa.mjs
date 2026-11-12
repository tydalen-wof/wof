// UEFA match feed (the JSON uefa.com itself uses). Senior men's national-team games only.
// Kick-off times are UTC instants and are converted to UK time with Intl.
import { getJson } from '../lib/http.mjs';
import { makeFixture, result, failure, looksPostponed } from '../lib/fixture.mjs';
import { isoToUk } from '../lib/time.mjs';

export const NAME = 'UEFA (official feed)';
const LIMIT = 200;
export const META = { id: 'uefa', name: NAME, url: 'https://match.uefa.com/v5/matches', postponements: true };

function tagFor(m) {
  if (m.competition?.code === 'UNL') {
    const group = m.group?.metaData?.groupName;
    return group ? `Nations League · ${group}` : 'Nations League';
  }
  if (/friendl/i.test(m.competition?.metaData?.name ?? '')) return 'Friendly';
  return m.competition?.metaData?.name ?? null;
}

export function parseUefa(json) {
  const fixtures = [];
  const teams = new Set();
  for (const m of json) {
    if (m.homeTeam?.teamTypeDetail !== 'NATIONAL_MEN_TEAM_A' || m.awayTeam?.teamTypeDetail !== 'NATIONAL_MEN_TEAM_A') continue;
    const home = m.homeTeam.internationalName, away = m.awayTeam.internationalName;
    if (!home || !away || !m.kickOffTime?.dateTime) continue;
    teams.add(home); teams.add(away);
    const uk = isoToUk(m.kickOffTime.dateTime);
    if (!uk) continue;
    const st = m.stadium;
    const name = st?.translations?.name?.EN ?? st?.translations?.officialName?.EN;
    const city = st?.city?.translations?.name?.EN;
    fixtures.push(makeFixture({
      date: uk.date, time: uk.time, home, away,
      venue: name ? (city && !name.includes(city) ? `${name}, ${city}` : name) : null,
      competition: m.competition?.code === 'UNL' ? 'UEFA Nations League' : 'International Friendly',
      tag: tagFor(m),
      status: looksPostponed(m.status) || /postpone/i.test(m.status ?? '') ? 'postponed' : 'scheduled',
      source: NAME,
    }));
  }
  return { fixtures, teams: [...teams] };
}

// ---- European club competitions (same feed, filtered by competition id) ----
export const CLUB_IDS = { 1: 'UEFA Champions League', 14: 'UEFA Europa League' };

/** "League Phase · Matchday 5", or "Round of 16 · 1st leg" for knockout ties. */
function clubTag(m) {
  const round = m.round?.metaData?.name ?? m.round?.name;
  const part = m.type === 'GROUP_STAGE' ? (m.matchday?.longName ?? m.matchday?.name)
    : m.type === 'FIRST_LEG' ? '1st leg' : m.type === 'SECOND_LEG' ? '2nd leg' : null;
  return [round, part].filter(Boolean).join(' · ') || null;
}

export function parseUefaClubs(json) {
  const out = { 1: { fixtures: [], teams: new Set() }, 14: { fixtures: [], teams: new Set() } };
  for (const m of json) {
    const id = String(m.competition?.id);
    if (!out[id]) continue;
    const home = m.homeTeam?.internationalName, away = m.awayTeam?.internationalName;
    if (!home || !away || !m.kickOffTime?.dateTime) continue;
    const uk = isoToUk(m.kickOffTime.dateTime);
    if (!uk) continue;
    out[id].teams.add(home); out[id].teams.add(away);
    const st = m.stadium;
    const name = st?.translations?.name?.EN ?? st?.translations?.officialName?.EN;
    const city = st?.city?.translations?.name?.EN;
    out[id].fixtures.push(makeFixture({
      date: uk.date, time: uk.time, home, away,
      venue: name ? (city && !name.includes(city) ? `${name}, ${city}` : name) : null,
      competition: CLUB_IDS[id], tag: clubTag(m),
      status: looksPostponed(m.status) || /postpone/i.test(m.status ?? '') ? 'postponed' : 'scheduled',
      source: NAME,
    }));
  }
  return out;
}

/** One extra request, limited to the two club competitions. Returns { 1: result, 14: result }. */
export async function collectClubs(ctx) {
  const meta = id => ({ id: `uefa-${id}`, name: NAME, url: META.url, postponements: true });
  try {
    const url = `${META.url}?competitionId=${Object.keys(CLUB_IDS).join(',')}&fromDate=${ctx.window.start}&toDate=${ctx.window.end}&limit=${LIMIT}&offset=0`;
    const json = await getJson(url);
    if (!Array.isArray(json)) throw new Error('unexpected response shape');
    const parsed = parseUefaClubs(json);
    const complete = json.length < LIMIT;
    const notes = complete ? [] : [`UEFA returned ${LIMIT} matches (its page limit), so later games may be missing.`];
    return Object.fromEntries(Object.keys(CLUB_IDS).map(id => [id, result(meta(id), { fixtures: parsed[id].fixtures, teams: [...parsed[id].teams], complete, notes })]));
  } catch (e) { return Object.fromEntries(Object.keys(CLUB_IDS).map(id => [id, failure(meta(id), e)])); }
}

export async function collect(ctx) {
  try {
    const url = `${META.url}?fromDate=${ctx.window.start}&toDate=${ctx.window.end}&limit=${LIMIT}&offset=0`;
    const json = await getJson(url);
    if (!Array.isArray(json)) throw new Error('unexpected response shape');
    const { fixtures, teams } = parseUefa(json);
    const complete = json.length < LIMIT;
    return result(META, {
      fixtures, teams, complete,
      notes: complete ? [] : [`UEFA returned ${LIMIT} matches (its page limit), so later games may be missing.`],
    });
  } catch (e) { return failure(META, e); }
}
