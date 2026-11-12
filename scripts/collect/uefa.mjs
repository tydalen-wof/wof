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
