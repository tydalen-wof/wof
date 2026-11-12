import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage, partition, CSS, fixtureKey } from '../scripts/render.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fx = (date, time, home, away, venue, o = {}) => ({ date, time, home, away, venue, competition: 'X', tag: null, status: 'scheduled', sources: ['S'], ...o });
const sec = (key, group, name, layout, followed, fixtures, o = {}) => ({ key, group, name, layout, followed, fixtures, sources: [], conflicts: [], notes: [], postponementCheck: `${name}: checked.`, ...o });
// The build decides each postcode; the page only shows what it is given.
const pcs = (list, text) => Object.fromEntries(list.map(f => [fixtureKey(f), text]));

const cymru = [
  fx('2026-11-21', '14:00', 'Holyhead Hotspur', 'Bala Town', 'The New Oval'),
  fx('2026-11-21', '14:00', 'Brickfield Rangers', 'Newtown', 'Clywedog Park'),
  fx('2026-11-14', '14:00', 'Bala Town', 'Holyhead Hotspur', null),
  fx('2026-11-14', '14:00', 'Followed No Postcode', 'Rhyl 1879', 'Some Ground'),
  fx('2026-11-14', '14:00', 'Llanuwchllyn', 'Rhyl 1879', null),
];
const welsh = [
  fx('2026-11-14', '14:00', 'Caerau Ely', 'Brickfield Rangers', null, { tag: 'Welsh Cup' }),
  fx('2026-11-14', '14:00', 'Holyhead Hotspur', 'Blaen-y-Maes', 'The New Oval', { tag: 'Welsh Cup' }),
  fx('2026-11-14', '14:00', 'Newtown', 'Caerphilly Athletic', null, { tag: 'Welsh Cup' }),
];
const trophy = [
  fx('2026-11-14', '15:00', 'Hebburn Town', 'Guiseley AFC', null, { tag: 'Second Round Proper' }),
  fx('2026-11-14', '15:00', 'Holyhead Hotspur', 'Chorley', null, { tag: 'Second Round Proper' }),   // a name that has a postcode elsewhere: only the build's map decides
  fx('2026-11-14', '15:00', 'Bath City', 'Truro City', 'Twerton Park', { tag: 'FA Trophy' }),
];

export const DATA = {
  checkedAt: '2026-11-12 05:30 GMT',
  window: { start: '2026-11-12', end: '2026-11-22' },
  notes: [],
  sections: [
    sec('wales', 'International', "Wales men's internationals", 'plain', [], [
      fx('2026-11-14', '17:00', 'Norway', 'Wales', 'Ullevaal Stadion, Oslo', { tag: 'Nations League · Group A4' }),
      fx('2026-11-17', '19:45', 'Wales', 'Portugal', 'Cardiff City Stadium', { tag: 'Nations League · Group A4' }),
    ]),
    sec('internationals', 'International', 'Other UK and European internationals', 'days', ['England', 'Scotland'], [
      fx('2026-11-13', '19:45', 'Scotland', 'North Macedonia', 'Hampden Park, Glasgow', { tag: 'Nations League · Group B1' }),
      fx('2026-11-12', '19:45', 'England', 'Croatia', 'Wembley Stadium, London', { tag: 'Nations League · Group A3' }),
      fx('2026-11-14', '19:45', 'Austria', 'Republic of Ireland', 'Raiffeisen Arena, Linz', { tag: 'Nations League · Group B3' }),
      fx('2026-11-15', '19:45', 'Spain', 'England', 'Metropolitano, Madrid', { tag: 'Nations League · Group A3' }),
      fx('2026-11-14', '17:00', 'France', 'Turkey', null, { tag: 'Friendly' }),
    ]),
    sec('cymru-north', 'Welsh', 'Novira Cymru North', 'rows', ['Holyhead Hotspur', 'Brickfield Rangers', 'Followed No Postcode'], cymru, {
      postcodes: { ...pcs([cymru[0]], 'LL65 2YE'), ...pcs([cymru[1]], 'LL14 4HE'), ...pcs([cymru[3]], 'Postcode not found') },
    }),
    sec('welsh-cup', 'Welsh', 'FAW Welsh Cup', 'rows', ['Holyhead Hotspur', 'Brickfield Rangers'], welsh, { postcodes: pcs([welsh[1]], 'LL65 2YE') }),
    sec('premier-league', 'English', 'Premier League', 'rows', ['Leeds United', 'Manchester United', 'Liverpool'], [
      fx('2026-11-22', '16:30', 'Liverpool', 'Manchester United', 'Anfield'),
      fx('2026-11-21', '12:30', 'Manchester City', 'Fulham', 'Etihad Stadium'),
      fx('2026-11-21', '15:00', 'Chelsea', 'Leeds United', 'Stamford Bridge'),
      fx('2026-11-21', '15:00', 'Aston Villa', 'Sunderland', 'Villa Park'),
    ]),
    sec('championship', 'English', 'Championship', 'rows', ['Wrexham'], []),
    sec('league-one', 'English', 'League One', 'rows', ['Plymouth Argyle', 'MK Dons'], [
      fx('2026-11-21', '15:00', 'Mansfield Town', 'MK Dons', 'One Call Stadium'),
      fx('2026-11-14', '15:00', 'Sheffield Wednesday', 'Plymouth Argyle', 'Hillsborough Stadium'),
      fx('2026-11-14', '15:00', 'Bromley', 'Notts County', 'Hayes Lane', { status: 'postponed' }),
      fx('2026-11-20', null, 'Barnsley', 'Sheffield Wednesday', null),
    ]),
    sec('southern-premier-south', 'English', 'Southern League Premier South', 'rows', ['Plymouth Parkway'], [
      fx('2026-11-14', '15:00', 'Hanwell Town', 'Plymouth Parkway', 'Oliver Connell and Sons Community Stadium'),
      fx('2026-11-21', '15:00', 'Plymouth Parkway', 'Malvern Town', 'Bolitho Park'),
    ], { postcodes: { '2026-11-21|Plymouth Parkway|Malvern Town': 'TE5 7ST' } }),
    sec('fa-cup', 'English', 'FA Cup', 'rows', ['Leeds United', 'Plymouth Parkway'], []),
    sec('fa-trophy', 'English', 'FA Trophy', 'rows', ['Plymouth Parkway'], trophy, { postcodes: pcs([trophy[2]], 'TE5 7ST') }),
  ],
};

const GROUPS = ['International', 'Welsh', 'English'];
const TITLES = {
  International: ["Wales men's internationals", 'Other UK and European internationals'],
  Welsh: ['Novira Cymru North', 'FAW Welsh Cup'],
  English: ['Premier League', 'Championship', 'League One', 'Southern League Premier South', 'FA Cup', 'FA Trophy'],
};
const EMPTY = ['Championship', 'FA Cup'];

const unescape = s => s.replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const escHtml = s => s.replace(/&/g, '&amp;').replace(/'/g, '&#39;');
const h2s = html => [...html.matchAll(/<h2>([^<]*)<\/h2>/g)].map(m => unescape(m[1]));
const titles = html => [...html.matchAll(/<div class="comp-t" role="heading" aria-level="3">([^<]*)<\/div>/g)].map(m => unescape(m[1]));
/** The HTML of one competition, from its title to the next competition, group or the end. */
function comp(html, name) {
  const start = html.indexOf(`aria-level="3">${escHtml(name)}</div>`);
  assert.ok(start >= 0, `no competition titled ${name}`);
  const rest = html.slice(start + 10);
  const ends = ['class="comp-t"', '<details class="group', '<section class="group-empty"', '</main>'].map(m => rest.indexOf(m)).filter(i => i >= 0);
  return html.slice(start, start + 10 + Math.min(...ends));
}
const teamsIn = html => [...html.matchAll(/<span class="team">([^<]*)<\/span><span class="v">v<\/span><span class="team">([^<]*)<\/span>/g)].map(m => `${unescape(m[1])} v ${unescape(m[2])}`);

function checkRules(html) {
  assert.doesNotMatch(html, /<details\b[^>]*\bopen\b/i, 'no <details> may carry the open attribute');
  assert.doesNotMatch(html, /<details\b[^>]*\bopen\s*=/i);
  assert.doesNotMatch(html, /<h3\b/i, 'no h3 anywhere');
  assert.deepEqual(h2s(html), [...GROUPS, 'Before you travel'], 'group order');
  assert.deepEqual(titles(html), GROUPS.flatMap(g => TITLES[g]), 'competition order within the groups');
  assert.doesNotMatch(html, /<(b|strong)\b/i, 'team names and rows are not bold');
  assert.doesNotMatch(html, /Rest of/, 'the "rest" line is called "Other fixtures"');
  assert.match(html, /All kick-off times are UK time\. Venues are the home club's ground\./);
  assert.match(html, /<h1>Week Ahead Fixtures<\/h1>/);
}

// ---- One outline of the page's structure (no styling), so any layout change shows up in review.
export function outline(html) {
  const main = html.slice(html.indexOf('<main>'), html.indexOf('</main>'));
  const text = s => unescape(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  const out = [];
  let depth = 0, row = null;
  const pad = () => '  '.repeat(depth);
  for (const line of main.split('\n')) {
    let m;
    if (line.startsWith('</details>')) { depth--; continue; }
    if ((m = /^<details class="([^"]*)">/.exec(line))) { out.push(`${pad()}details.${m[1].replace(/ /g, '.')}`); depth++; continue; }
    if ((m = /^<summary class="([^"]*)">(.*)/.exec(line))) { out.push(`${pad()}summary.${m[1]}${m[2] ? ' ' + text(m[2]) : ''}`); continue; }
    if ((m = /^<section class="([^"]*)">(.*)<\/section>/.exec(line))) { out.push(`${pad()}section.${m[1]} ${text(m[2])}`); continue; }
    if (line.startsWith('<div class="row">')) { row = []; continue; }
    if (row && (m = /^<div class="(when|match|venue)">(.*)<\/div>/.exec(line))) {
      row.push(text(m[2]));
      if (m[1] === 'venue') { out.push(`${pad()}row | ${row.join(' | ')}`); row = null; }
      continue;
    }
    if ((m = /^<p class="(day|sub)">(.*)<\/p>/.exec(line))) { out.push(`${pad()}${m[1]}: ${text(m[2])}`); continue; }
    if (/^<div class="rest-line">/.test(line)) { out.push(`${pad()}rest-line: ${text(line)}`); continue; }
    if (/^<div class="rest-body">/.test(line)) { out.push(`${pad()}rest-body`); continue; }
  }
  return out.join('\n') + '\n';
}

test('rendered page follows the layout rules', () => {
  checkRules(renderPage(DATA));
});

test('three top-level group accordions, each holding its competitions as nested accordions', () => {
  const html = renderPage(DATA);
  const groups = [...html.matchAll(/<details class="group">\n<summary class="group-h"><h2>([^<]*)<\/h2><\/summary>\n<div class="group-body">/g)].map(m => m[1]);
  assert.deepEqual(groups, GROUPS);
  // Every competition sits inside a group body, never at the top level.
  const topLevelComp = html.slice(html.indexOf('<main>')).match(/<main>\n(?:(?!<details class="group)[\s\S])*?<details class="comp">/);
  assert.equal(topLevelComp, null, 'no competition accordion before the first group');
  for (const g of GROUPS) {
    const start = html.indexOf(`<h2>${g}</h2>`);
    const end = Math.min(...[...GROUPS, 'Before you travel'].filter(x => x !== g).map(x => html.indexOf(`<h2>${x}</h2>`)).filter(i => i > start));
    assert.deepEqual(titles(html.slice(start, end)), TITLES[g], `${g} holds its own competitions`);
  }
  // Competitions with games are collapsed accordions; those without are plain titles.
  const accordions = [...html.matchAll(/<details class="comp">\n<summary class="comp-h"><div class="comp-t" role="heading" aria-level="3">([^<]*)<\/div><\/summary>/g)].map(m => unescape(m[1]));
  assert.deepEqual(accordions, GROUPS.flatMap(g => TITLES[g]).filter(t => !EMPTY.includes(t)));
  for (const e of EMPTY) assert.match(html, new RegExp(`<section class="comp-empty"><div class="comp-t" role="heading" aria-level="3">${e}</div></section>`));
});

test('"Before you travel" is the last top-level accordion and holds the sources and checked-at time', () => {
  const html = renderPage(DATA);
  assert.match(html, /<details class="group travel">\n<summary class="group-h"><h2>Before you travel<\/h2><\/summary>/);
  assert.ok(html.lastIndexOf('<details class="group') === html.indexOf('<details class="group travel">'));
  for (const s of ['Source conflicts', 'Postponements', 'To be confirmed', 'Caveats', 'Sources', 'Checked at']) assert.match(html, new RegExp(`<p class="sub">${s}</p>`));
  assert.match(html, /2026-11-12 05:30 GMT \(UK time\)/);
});

test('a group with nothing to show is a plain heading; one with an unreadable competition stays an accordion', () => {
  const none = structuredClone(DATA);
  for (const s of none.sections.filter(s => s.group === 'Welsh')) s.fixtures = [];
  let html = renderPage(none);
  assert.match(html, /<section class="group-empty"><h2>Welsh<\/h2><\/section>/);
  checkRules(html.replace('<section class="group-empty"><h2>Welsh</h2></section>', '<details class="group"><summary class="group-h"><h2>Welsh</h2></summary><div class="group-body"><div class="comp-t" role="heading" aria-level="3">Novira Cymru North</div><div class="comp-t" role="heading" aria-level="3">FAW Welsh Cup</div></div></details>'));
  const down = structuredClone(DATA);
  for (const s of down.sections.filter(s => s.group === 'Welsh')) s.fixtures = [];
  down.sections.find(s => s.key === 'cymru-north').unavailable = true;
  html = renderPage(down);
  assert.doesNotMatch(html, /<section class="group-empty">/);
  assert.match(html, /<h2>Welsh<\/h2><\/summary>/);
  assert.match(html, /Novira Cymru North<\/div><p class="muted unavailable">Could not be read/);
});

test('the Wales men\'s section is a plain title when it has no games', () => {
  const data = structuredClone(DATA);
  data.sections[0].fixtures = [];
  const html = renderPage(data);
  assert.match(html, /<section class="comp-empty"><div class="comp-t" role="heading" aria-level="3">Wales men&#39;s internationals<\/div><\/section>/);
  assert.doesNotMatch(html, /<details\b[^>]*\bopen\b/i);
});

test('followed rows sit in the nested summary, followed by the "Other fixtures" line with a count', () => {
  const html = renderPage(DATA);
  const pl = comp(html, 'Premier League');
  assert.match(pl, /<details class="rest">\n<summary class="rest-s">\n<div class="row">/);
  assert.match(pl, /<div class="rest-line"><span>Other fixtures<\/span><span class="count">2 matches<\/span><\/div>\n<\/summary>\n<div class="rest-body">/);
  assert.doesNotMatch(pl, /<h[2-6]/);
  for (const name of ['League One', 'FAW Welsh Cup', 'FA Trophy', 'Other UK and European internationals']) assert.match(comp(html, name), /<span>Other fixtures<\/span>/, name);
});

test('followed teams come first in configured order, and a game between two followed teams appears once', () => {
  const order = teamsIn(comp(renderPage(DATA), 'Premier League'));
  assert.deepEqual(order, ['Chelsea v Leeds United', 'Liverpool v Manchester United', 'Manchester City v Fulham', 'Aston Villa v Sunderland']);
  assert.equal(order.filter(o => /Liverpool/.test(o)).length, 1);
});

test('followed and other teams are styled identically (no highlight, no bold)', () => {
  assert.match(CSS, /\.team\{font-weight:400\}/);
  assert.doesNotMatch(CSS, /followed|\.team[^{]*\{[^}]*(background|font-weight:[5-9]00|font-weight:bold)/i);
  assert.doesNotMatch(renderPage(DATA), /class="team [^"]*"/);
});

test('internationals use day sub-labels (not headings) and chronological followed rows', () => {
  const intl = comp(renderPage(DATA), 'Other UK and European internationals');
  const days = [...intl.matchAll(/<p class="day">([^<]*)<\/p>/g)].map(m => m[1]);
  assert.deepEqual(days, ['Thursday 12 November', 'Friday 13 November', 'Sunday 15 November', 'Saturday 14 November'], 'followed block runs chronologically, then the rest block restarts');
  assert.match(intl, /Other fixtures<\/span><span class="count">2 matches/);
});

test('postcodes are shown exactly where the build supplied one, and nowhere else', () => {
  const html = renderPage(DATA);
  const rows = [...html.matchAll(/<div class="match">.*?<span class="team">([^<]*)<\/span><span class="v">v<\/span>.*?<div class="venue"><span class="ven">([^<]*)<\/span>(<span class="pc">([^<]*)<\/span>)?/gs)]
    .map(m => ({ home: m[1], venue: m[2], pc: m[4] ?? null }));
  assert.deepEqual(rows.filter(r => r.pc).map(r => `${r.home}: ${r.pc}`).sort(), [
    'Bath City: TE5 7ST', 'Brickfield Rangers: LL14 4HE', 'Followed No Postcode: Postcode not found',
    'Holyhead Hotspur: LL65 2YE', 'Holyhead Hotspur: LL65 2YE', 'Plymouth Parkway: TE5 7ST',
  ]);
  assert.equal((html.match(/class="pc"/g) ?? []).length, 6);
  // The count per competition: the FA Trophy row for a name with a postcode elsewhere shows none (the build did not supply one).
  const n = name => (comp(html, name).match(/class="pc"/g) ?? []).length;
  assert.deepEqual(['Novira Cymru North', 'FAW Welsh Cup', 'Southern League Premier South', 'FA Trophy', 'Premier League', 'FA Cup'].map(n), [3, 1, 1, 1, 0, 0]);
  assert.ok(rows.find(r => r.home === 'Bala Town' && !r.pc && r.venue === 'TBC'));
  assert.ok(rows.find(r => r.home === 'Holyhead Hotspur' && r.venue === 'TBC' && !r.pc), 'the Trophy row without a supplied postcode shows none');
});

test('unknown times and venues show TBC; postponed games are marked and the time struck through', () => {
  const html = renderPage(DATA);
  assert.match(html, /<span class="t">TBC<\/span>/);
  assert.match(html, /<span class="tag tag-pp">Postponed<\/span>/);
  assert.match(html, /<span class="t"><s>15:00<\/s><\/span>/);
});

test('cup sections: round tags show, a cup with no ties is a plain title, followed clubs lead', () => {
  const html = renderPage(DATA);
  const t = comp(html, 'FA Trophy');
  assert.equal((t.match(/Second Round Proper/g) ?? []).length, 2);
  assert.match(t, /<span class="tag">FA Trophy<\/span>/);
  assert.deepEqual(teamsIn(comp(html, 'FAW Welsh Cup')), ['Holyhead Hotspur v Blaen-y-Maes', 'Caerau Ely v Brickfield Rangers', 'Newtown v Caerphilly Athletic']);
});

test('design tokens, themes, groups and responsive rules are present', () => {
  for (const v of ['#ECEFEA', '#F6F8F4', '#15231B', '#58695E', '#C8D1C7', '#146C43', '#0E1712', '#15211A', '#E6EEE7', '#94A69A', '#263830', '#5CC48A']) assert.ok(CSS.includes(v), v);
  assert.match(CSS, /prefers-color-scheme:dark/);
  assert.match(CSS, /data-theme="dark"/);
  assert.match(CSS, /data-theme="light"/);
  assert.match(CSS, /max-width:880px/);
  assert.match(CSS, /@media \(max-width:639px\)\{[^}]*\.row\{grid-template-columns:1fr/);
  assert.match(CSS, /grid-template-columns:7\.5rem minmax\(0,1\.7fr\) minmax\(0,1fr\)/);
  assert.match(CSS, /padding:28px 16px 56px/);
  assert.match(CSS, /\.group-h::after/);
  assert.match(CSS, /details\[open\]>\.group-h::after/);
  const html = renderPage(DATA);
  assert.match(html, /family=Barlow\+Condensed[^"]*&family=IBM\+Plex\+Sans/);
  assert.match(CSS, /"Barlow Condensed","Arial Narrow"/);
  assert.match(CSS, /"IBM Plex Sans","Helvetica Neue"/);
});

test('partition keeps configured order and never duplicates', () => {
  const list = [fx('2026-11-22', '16:30', 'Liverpool', 'Manchester United', 'A'), fx('2026-11-21', '15:00', 'Chelsea', 'Leeds United', 'B'), fx('2026-11-21', '15:00', 'Villa', 'Fulham', 'C')];
  const { mine, rest } = partition(list, ['Leeds United', 'Manchester United', 'Liverpool']);
  assert.deepEqual(mine.map(f => f.home), ['Chelsea', 'Liverpool']);
  assert.deepEqual(rest.map(f => f.home), ['Villa']);
});

test('structure snapshot', () => {
  const actual = outline(renderPage(DATA));
  const file = join(ROOT, 'test/snapshots/structure.txt');
  if (!existsSync(file) || process.env.UPDATE_SNAPSHOT) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, actual);
  }
  assert.equal(actual, readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), 'page structure changed; review it, then run with UPDATE_SNAPSHOT=1 to accept');
});

// ---- The real, freshly built page and data (the workflow builds before it tests).
const REAL = join(ROOT, 'index.html');
test('built index.html: nothing open, no h3, groups and competitions in order', { skip: !existsSync(REAL) && 'index.html has not been built' }, () => {
  const html = readFileSync(REAL, 'utf8');
  checkRules(html);
  assert.equal((html.match(/<details class="group(?: travel)?">/g) ?? []).length + (html.match(/<section class="group-empty">/g) ?? []).length, GROUPS.length + 1);
});

test('built data/fixtures.json: normalised fixture shape', { skip: !existsSync(join(ROOT, 'data/fixtures.json')) && 'data not built' }, () => {
  const d = JSON.parse(readFileSync(join(ROOT, 'data/fixtures.json'), 'utf8'));
  assert.ok(d.fixtures.length > 0);
  for (const f of d.fixtures) {
    assert.match(f.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(f.time === null || /^\d{2}:\d{2}$/.test(f.time), `time ${f.time}`);
    assert.ok(f.date >= d.window.start && f.date <= d.window.end, `${f.home} v ${f.away} ${f.date} outside window`);
    assert.ok(f.home && f.away && f.competition);
    assert.ok(f.venue === null || typeof f.venue === 'string');
    assert.ok(f.tag === null || typeof f.tag === 'string');
    assert.ok(['scheduled', 'postponed'].includes(f.status));
    assert.ok(Array.isArray(f.sources) && f.sources.length > 0);
  }
  const keys = d.fixtures.filter(f => f.competition === 'Premier League').map(f => [f.date, f.home, f.away].join('|'));
  assert.equal(new Set(keys).size, keys.length, 'no duplicate Premier League fixtures');
  assert.deepEqual([...new Set(d.sections.map(s => s.group))], GROUPS);
});

test('built data: no section with several games shows every kick-off time as TBC (guards against a parsing slip)', { skip: !existsSync(join(ROOT, 'data/fixtures.json')) && 'data not built' }, () => {
  const d = JSON.parse(readFileSync(join(ROOT, 'data/fixtures.json'), 'utf8'));
  for (const s of d.sections) {
    const live = s.fixtures.filter(f => f.status !== 'postponed');
    if (live.length >= 3) assert.ok(live.some(f => f.time), `${s.name}: every kick-off time is empty`);
  }
});
