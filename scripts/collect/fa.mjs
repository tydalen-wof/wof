// The FA's own fixtures pages for the FA Cup and the FA Trophy (server-rendered tables, one per match day).
// Each table has the date and round in its header, then rows of: kick-off / number / home VS away.
// Limits: the page lists only the NEXT round, so ties of a later round are not shown until that round is next, and
// no venue or postponement status is given. Times are UK time as published.
import { getText } from '../lib/http.mjs';
import { decodeEntities, stripTags } from '../lib/html.mjs';
import { makeFixture, result, failure, looksPostponed } from '../lib/fixture.mjs';
import { monthNumber } from '../lib/time.mjs';

export const NAME = 'The FA (official site)';
export const PAGES = {
  'FA Cup': 'https://www.thefa.com/competitions/thefacup/fixtures',
  'FA Trophy': 'https://www.thefa.com/competitions/fa-trophy/fixtures',
};

const cleanTeam = s => decodeEntities(stripTags(s)).replace(/[_*]+$/g, '').replace(/\s+/g, ' ').trim();

/** "Saturday 14 November 2026" -> "2026-11-14" */
export function parseFaDate(text) {
  const m = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(text ?? '');
  const mon = m && monthNumber(m[2]);
  return mon ? `${m[3]}-${String(mon).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}` : null;
}

export function parseFa(html, competition) {
  const fixtures = [];
  const teams = new Set();
  for (const table of html.split(/<table class="gTable"/).slice(1)) {
    const body = table.slice(0, table.indexOf('</table>'));
    const date = parseFaDate(/class="headl">([^<]*)/.exec(body)?.[1]);
    const round = decodeEntities(/class="headr">([^<]*)/.exec(body)?.[1] ?? '').trim();
    if (!date) continue;
    for (const row of body.split(/<tr/).slice(1)) {
      if (!/class="cThree"/.test(row)) continue;
      const cell = c => new RegExp(`class="${c}[^"]*">([\\s\\S]*?)</td>`).exec(row)?.[1] ?? '';
      const home = cleanTeam(cell('cThree')), away = cleanTeam(cell('cFive'));
      if (!home || !away) continue;
      teams.add(home); teams.add(away);
      // The FA writes <time datetime=">15:00">15:00</time> (a stray ">" inside the attribute), so take the digits before </time>.
      const t = /(\d{1,2}:\d{2})\s*<\/time>/.exec(cell('cOne'))?.[1] ?? stripTags(cell('cOne'));
      const note = `${stripTags(cell('cSix'))} ${stripTags(cell('cSeven'))}`;
      fixtures.push(makeFixture({
        date, time: /^\d{1,2}:\d{2}$/.test(t) ? t : null, home, away, competition,
        tag: round || competition, status: looksPostponed(note) || /postponed/i.test(stripTags(cell('cOne'))) ? 'postponed' : 'scheduled',
        source: NAME,
      }));
    }
  }
  return { fixtures, teams: [...teams] };
}

export async function collect(competition) {
  const url = PAGES[competition];
  const meta = { id: 'fa-' + competition.toLowerCase().replace(/\W+/g, '-'), name: NAME, url, postponements: false };
  try {
    const { fixtures, teams } = parseFa(await getText(url, { timeoutMs: 60000 }), competition);
    if (!fixtures.length) throw new Error('no fixtures found in page (layout may have changed, or no round is scheduled)');
    return result(meta, {
      fixtures, teams, complete: true,
      notes: [`The FA page lists only the next round of ${competition} ties, with no venues or postponement status.`],
    });
  } catch (e) { return failure(meta, e); }
}
