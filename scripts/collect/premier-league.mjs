// Premier League official fixtures feed (the JSON the premierleague.com site itself uses).
import { getJson } from '../lib/http.mjs';
import { makeFixture, result, failure, looksPostponed } from '../lib/fixture.mjs';
import { isoToUk } from '../lib/time.mjs';

export const META = {
  id: 'pl-official',
  name: 'Premier League (official feed)',
  url: 'https://footballapi.pulselive.com/football/fixtures',
  postponements: true,
};
const FEED = 'https://footballapi.pulselive.com/football/fixtures?comps=1&pageSize=400&sort=asc&statuses=U,L,P,A&altIds=true';

export async function collect() {
  try {
    const json = await getJson(FEED);
    const rows = json.content ?? [];
    if (!rows.length) throw new Error('feed returned no fixtures');
    const teams = new Set();
    const fixtures = [];
    for (const f of rows) {
      const home = f.teams?.[0]?.team?.name, away = f.teams?.[1]?.team?.name;
      if (!home || !away) continue;
      teams.add(home); teams.add(away);
      const millis = f.kickoff?.millis;
      const completeness = f.kickoff?.completeness ?? 3;
      if (millis == null || completeness < 2) continue;                 // date not yet known
      const uk = isoToUk(millis);
      const timeKnown = completeness >= 3 && !/tbc|tbd/i.test(f.kickoff.label ?? '');
      fixtures.push(makeFixture({
        date: uk.date, time: timeKnown ? uk.time : null, home, away,
        venue: f.ground?.name ?? null, competition: 'Premier League',
        status: ['P', 'A'].includes(f.status) || looksPostponed(f.kickoff?.label) ? 'postponed' : 'scheduled',
        source: META.name,
      }));
    }
    const complete = (json.pageInfo?.numPages ?? 1) <= 1;
    return result(META, {
      fixtures, teams: [...teams], complete,
      notes: complete ? [] : ['The feed returned more than one page; only the first page was read.'],
    });
  } catch (e) { return failure(META, e); }
}
