// Languages for the page. English is built in (and is what every data file uses); Welsh comes from config/lang.cy.json.
// Only display changes: team names, dates and labels are translated when the page is drawn, never in the data, so
// followed teams, de-duplication and the postcode lookup all keep working on the canonical English names.
//
// What is translated: page chrome, dates and weekdays, group and competition names, tags, the "Other fixtures" line,
// the templated lines in "Before you travel", and national-team names. What is not: club and ground names (proper
// names) and the free-text technical notes the collectors write, which stay in English and are marked lang="en".
import { shortDate as enShortDate, longDate as enLongDate, rangeLabel as enRangeLabel, dayOfWeek } from './time.mjs';

export const EN_UI = {
  title: 'Week Ahead Fixtures',
  lede: "All kick-off times are UK time. Venues are the home club's ground.",
  to: 'to',
  other: 'Other fixtures',
  matchOne: '{n} match',
  matchMany: '{n} matches',
  postponed: 'Postponed',
  tbc: 'TBC',
  postcodeNotFound: 'Postcode not found',
  unavailable: 'Could not be read. See Before you travel.',
  travel: 'Before you travel',
  subConflicts: 'Source conflicts',
  subPostponements: 'Postponements',
  subTbc: 'To be confirmed',
  subCaveats: 'Caveats',
  subSources: 'Sources',
  subChecked: 'Checked at',
  technicalNotes: '',
  noConflicts: 'No disagreements were found between the sources that could be read.',
  allKnown: 'Every game shown has a kick-off time and a venue.',
  postponedLine: '{section}: {label} is marked postponed. Do not travel until it is rearranged.',
  tbcTime: '{section}: kick-off time TBC for {label}.',
  tbcVenue: '{section}: venue TBC for {label}.',
  mainList: '(main list)',
  crossCheck: '(cross-check)',
  noSource: 'no source could be read',
  failed: '{name} failed: {error}',
  hiddenNote: 'Not shown this week, because none of the named teams (config/teams.json) are involved: {names}.',
  ukTime: '(UK time)',
};

const fmt = (s, p = {}) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in p ? p[k] : m));

/** The language the other page is in, for the swap link in the header. */
const SWITCH = {
  en: { code: 'CY', name: 'Cymraeg', lang: 'cy', href: 'cy/' },
  cy: { code: 'EN', name: 'English', lang: 'en', href: '../' },
};

export function makeLang(code = 'en', pack = null) {
  const cy = code === 'cy';
  if (cy && !pack) throw new Error('the Welsh pack (config/lang.cy.json) is required');
  const ui = { ...EN_UI, ...(cy ? pack.ui : {}) };
  const part = (map, key) => (cy ? (map?.[key] ?? key) : key);

  // Welsh dates: weekday and month names come from the pack. English keeps the existing formatters.
  const dmy = d => d.split('-').map(Number);
  const shortDate = date => { if (!cy) return enShortDate(date); const [, m, d] = dmy(date); return `${pack.daysShort[dayOfWeek(date)]} ${d} ${pack.monthsShort[m - 1]}`; };
  const longDate = date => { if (!cy) return enLongDate(date); const [, m, d] = dmy(date); return `${pack.days[dayOfWeek(date)]} ${d} ${pack.months[m - 1]}`; };
  const rangeLabel = w => {
    if (!cy) return enRangeLabel(w);
    const [ay, am, ad] = dmy(w.start), [by, bm, bd] = dmy(w.end);
    return `${ad} ${pack.monthsShort[am - 1]}${ay !== by ? ' ' + ay : ''} ${ui.to} ${bd} ${pack.monthsShort[bm - 1]} ${by}`;
  };

  // A tag such as "Nations League · Group A4" is translated part by part. If any part has no Welsh, the whole tag
  // stays English (and the page marks it lang="en"), so a half-translated label is never invented.
  const tag = text => {
    if (!cy) return { text, translated: true };
    let all = true;
    const out = String(text).split(' · ').map(p => {
      if (pack.tags?.[p]) return pack.tags[p];
      for (const rule of pack.tagPatterns ?? []) {
        const re = new RegExp(rule.match);
        if (re.test(p)) return p.replace(re, rule.replace);
      }
      all = false;
      return p;
    });
    return all ? { text: out.join(' · '), translated: true } : { text, translated: false };
  };

  return {
    code,
    htmlLang: cy ? 'cy' : 'en-GB',
    assetBase: cy ? '../' : '',
    switchTo: SWITCH[cy ? 'cy' : 'en'],
    ui: (key, params) => fmt(ui[key] ?? EN_UI[key] ?? key, params),
    shortDate, longDate, rangeLabel, tag,
    group: name => part(pack?.groups, name),
    comp: name => part(pack?.competitions, name),
    team: name => part(pack?.teams, name),
    count: n => fmt(n === 1 ? ui.matchOne : ui.matchMany, { n }),
  };
}
