import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage, partition, CSS } from '../scripts/render.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fx = (date, time, home, away, venue, o = {}) => ({ date, time, home, away, venue, competition: 'X', tag: null, status: 'scheduled', sources: ['S'], ...o });
const sec = (key, name, layout, followed, fixtures, o = {}) => ({ key, name, layout, followed, fixtures, sources: [], conflicts: [], notes: [], postponementCheck: `${name}: checked.`, ...o });

export const DATA = {
  checkedAt: '2026-11-12 05:30 GMT',
  window: { start: '2026-11-12', end: '2026-11-22' },
  notes: [],
  postcodes: {
    followedHomes: ['Holyhead Hotspur', 'Brickfield Rangers', 'Followed No Postcode'],
    grounds: { 'Holyhead Hotspur': { venue: 'The New Oval', postcode: 'LL65 2YE' }, 'Brickfield Rangers': { venue: 'Clywedog Park', postcode: 'LL14 4HE' } },
  },
  sections: [
    sec('wales', "Wales men's internationals", 'plain', [], [
      fx('2026-11-14', '17:00', 'Norway', 'Wales', 'Ullevaal Stadion, Oslo', { tag: 'Nations League · Group A4' }),
      fx('2026-11-17', '19:45', 'Wales', 'Portugal', 'Cardiff City Stadium', { tag: 'Nations League · Group A4' }),
    ]),
    sec('internationals', 'Other UK and European internationals', 'days', ['England', 'Scotland'], [
      fx('2026-11-13', '19:45', 'Scotland', 'North Macedonia', 'Hampden Park, Glasgow', { tag: 'Nations League · Group B1' }),
      fx('2026-11-12', '19:45', 'England', 'Croatia', 'Wembley Stadium, London', { tag: 'Nations League · Group A3' }),
      fx('2026-11-14', '19:45', 'Austria', 'Republic of Ireland', 'Raiffeisen Arena, Linz', { tag: 'Nations League · Group B3' }),
      fx('2026-11-15', '19:45', 'Spain', 'England', 'Metropolitano, Madrid', { tag: 'Nations League · Group A3' }),
      fx('2026-11-14', '17:00', 'France', 'Turkey', null, { tag: 'Friendly' }),
    ]),
    sec('premier-league', 'Premier League', 'rows', ['Leeds United', 'Manchester United', 'Liverpool'], [
      fx('2026-11-22', '16:30', 'Liverpool', 'Manchester United', 'Anfield'),
      fx('2026-11-21', '12:30', 'Manchester City', 'Fulham', 'Etihad Stadium'),
      fx('2026-11-21', '15:00', 'Chelsea', 'Leeds United', 'Stamford Bridge'),
      fx('2026-11-21', '15:00', 'Aston Villa', 'Sunderland', 'Villa Park'),
    ]),
    sec('championship', 'Championship', 'rows', ['Wrexham'], []),
    sec('league-one', 'League One', 'rows', ['Plymouth Argyle', 'MK Dons'], [
      fx('2026-11-21', '15:00', 'Mansfield Town', 'MK Dons', 'One Call Stadium'),
      fx('2026-11-14', '15:00', 'Sheffield Wednesday', 'Plymouth Argyle', 'Hillsborough Stadium'),
      fx('2026-11-14', '15:00', 'Bromley', 'Notts County', 'Hayes Lane', { status: 'postponed' }),
      fx('2026-11-20', null, 'Barnsley', 'Sheffield Wednesday', null),
    ]),
    sec('southern-premier-south', 'Southern League Premier South', 'rows', ['Plymouth Parkway'], [
      fx('2026-11-14', '15:00', 'Hanwell Town', 'Plymouth Parkway', 'Oliver Connell and Sons Community Stadium'),
      fx('2026-11-14', '15:00', 'Poole Town', 'Uxbridge', 'Clear Group Stadium', { tag: 'FA Trophy' }),
    ]),
    sec('cymru-north', 'Novira Cymru North', 'rows', ['Holyhead Hotspur', 'Brickfield Rangers'], [
      fx('2026-11-21', '14:00', 'Holyhead Hotspur', 'Bala Town', 'The New Oval'),
      fx('2026-11-21', '14:00', 'Brickfield Rangers', 'Newtown', 'Clywedog Park'),
      fx('2026-11-14', '14:00', 'Bala Town', 'Holyhead Hotspur', null),
      fx('2026-11-14', '14:00', 'Followed No Postcode', 'Rhyl 1879', 'Some Ground'),
      fx('2026-11-14', '14:00', 'Llanuwchllyn', 'Rhyl 1879', null),
    ], { showPostcodes: true }),
    sec('fa-cup', 'FA Cup', 'rows', ['Leeds United', 'Plymouth Parkway'], []),
    sec('fa-trophy', 'FA Trophy', 'rows', ['Plymouth Parkway'], [
      fx('2026-11-14', '15:00', 'Hebburn Town', 'Guiseley AFC', null, { tag: 'Second Round Proper' }),
      fx('2026-11-14', '15:00', 'Holyhead Hotspur', 'Chorley', null, { tag: 'Second Round Proper' }),   // a followed Cymru North name outside the Welsh sections: no postcode
      fx('2026-11-14', '15:00', 'Bath City', 'Truro City', 'Twerton Park', { tag: 'FA Trophy' }),
    ], { restLabel: 'Rest of the round' }),
    sec('welsh-cup', 'FAW Welsh Cup', 'rows', ['Holyhead Hotspur', 'Brickfield Rangers'], [
      fx('2026-11-14', '14:00', 'Caerau Ely', 'Brickfield Rangers', null, { tag: 'Welsh Cup' }),
      fx('2026-11-14', '14:00', 'Holyhead Hotspur', 'Blaen-y-Maes', 'The New Oval', { tag: 'Welsh Cup' }),
      fx('2026-11-14', '14:00', 'Newtown', 'Caerphilly Athletic', null, { tag: 'Welsh Cup' }),
    ], { showPostcodes: true, restLabel: 'Rest of the round' }),
  ],
};
DATA.postcodes.followedHomes.push();
DATA.sections.find(s => s.key === 'cymru-north').followed.push('Followed No Postcode');

const HEADINGS = ["Wales men's internationals", 'Other UK and European internationals', 'Premier League', 'Championship', 'League One', 'Southern League Premier South', 'Novira Cymru North', 'FA Cup', 'FA Trophy', 'FAW Welsh Cup', 'Before you travel'];
const unescape = s => s.replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const h2s = html => [...html.matchAll(/<h2>([^<]*)<\/h2>/g)].map(m => unescape(m[1]));

function checkRules(html, { headings = HEADINGS } = {}) {
  assert.doesNotMatch(html, /<details\b[^>]*\bopen\b/i, 'no <details> may carry the open attribute');
  assert.doesNotMatch(html, /<details\b[^>]*\bopen\s*=/i);
  assert.doesNotMatch(html, /<h3\b/i, 'no h3 anywhere');
  assert.deepEqual(h2s(html), headings, 'section order');
  assert.doesNotMatch(html, /<(b|strong)\b/i, 'team names and rows are not bold');
  assert.match(html, /All kick-off times are UK time\. Venues are the home club's ground\./);
  assert.match(html, /<h1>Week Ahead Fixtures<\/h1>/);
}

// ---- Build one outline of the page's structure (no styling) so any layout change shows up in review.
export function outline(html) {
  const main = html.slice(html.indexOf('<main>'), html.indexOf('</main>'));
  const text = s => unescape(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  const out = [];
  let depth = 0, row = null;
  for (const line of main.split('\n')) {
    let m;
    if (line.startsWith('</details>')) { depth--; continue; }
    if ((m = /^<details class="([^"]*)">/.exec(line))) { out.push(`${'  '.repeat(depth)}details.${m[1].replace(/ /g, '.')}`); depth++; continue; }
    if ((m = /^<summary class="([^"]*)">(.*)/.exec(line))) { out.push(`${'  '.repeat(depth)}summary.${m[1]}${m[2] ? ' ' + text(m[2]) : ''}`); continue; }
    if ((m = /^<section class="([^"]*)">(.*)<\/section>/.exec(line))) { out.push(`${'  '.repeat(depth)}section.${m[1]} ${text(m[2])}`); continue; }
    if (line.startsWith('<div class="row">')) { row = []; continue; }
    if (row && (m = /^<div class="(when|match|venue)">(.*)<\/div>/.exec(line))) {
      row.push(text(m[2]));
      if (m[1] === 'venue') { out.push(`${'  '.repeat(depth)}row | ${row.join(' | ')}`); row = null; }
      continue;
    }
    if ((m = /^<p class="(day|sub)">(.*)<\/p>/.exec(line))) { out.push(`${'  '.repeat(depth)}${m[1]}: ${text(m[2])}`); continue; }
    if (/^<div class="rest-line">/.test(line)) { out.push(`${'  '.repeat(depth)}rest-line: ${text(line)}`); continue; }
    if (/^<div class="rest-body">/.test(line)) { out.push(`${'  '.repeat(depth)}rest-body`); continue; }
  }
  return out.join('\n') + '\n';
}

test('rendered page follows the layout rules', () => {
  const html = renderPage(DATA);
  checkRules(html);
});

test('every competition is a top-level collapsed <details class="comp"> with the h2 inside its summary', () => {
  const html = renderPage(DATA);
  const comps = [...html.matchAll(/<details class="comp(?: travel)?">\n<summary class="comp-h"><h2>([^<]*)<\/h2><\/summary>\n<div class="comp-body">/g)].map(m => unescape(m[1]));
  assert.deepEqual(comps, HEADINGS.filter(h => !['Championship', 'FA Cup'].includes(h)));
  for (const empty of ['Championship', 'FA Cup']) assert.match(html, new RegExp(`<section class="comp-empty"><h2>${empty}</h2></section>`), 'a competition with no games is a plain heading');
});

test('the Wales section is a plain heading when it has no games', () => {
  const data = structuredClone(DATA);
  data.sections[0].fixtures = [];
  const html = renderPage(data);
  assert.match(html, /<section class="comp-empty"><h2>Wales men&#39;s internationals<\/h2><\/section>/);
  checkRules(html);
});

test('a section whose sources all failed says so, instead of looking like a week with no games', () => {
  const data = structuredClone(DATA);
  Object.assign(data.sections[5], { fixtures: [], unavailable: true });
  const html = renderPage(data);
  assert.match(html, /<h2>Southern League Premier South<\/h2><p class="muted unavailable">Could not be read/);
});

test('followed rows sit in the nested summary, followed by the "Rest of the division" line with a count', () => {
  const html = renderPage(DATA);
  const pl = html.slice(html.indexOf('<h2>Premier League</h2>'), html.indexOf('<h2>Championship</h2>'));
  assert.match(pl, /<details class="rest">\n<summary class="rest-s">\n<div class="row">/);
  assert.match(pl, /<div class="rest-line"><span>Rest of the division<\/span><span class="count">2 matches<\/span><\/div>\n<\/summary>\n<div class="rest-body">/);
  assert.doesNotMatch(pl, /<h3|<h4/);
});

test('followed teams come first in configured order, and a game between two followed teams appears once', () => {
  const html = renderPage(DATA);
  const pl = html.slice(html.indexOf('<h2>Premier League</h2>'), html.indexOf('<h2>Championship</h2>'));
  const order = [...pl.matchAll(/<span class="team">([^<]*)<\/span><span class="v">v<\/span><span class="team">([^<]*)<\/span>/g)].map(m => `${m[1]} v ${m[2]}`);
  assert.deepEqual(order, ['Chelsea v Leeds United', 'Liverpool v Manchester United', 'Manchester City v Fulham', 'Aston Villa v Sunderland']);
  assert.equal(order.filter(o => /Liverpool/.test(o)).length, 1);
});

test('followed and other teams are styled identically (no highlight, no bold)', () => {
  assert.match(CSS, /\.team\{font-weight:400\}/);
  assert.doesNotMatch(CSS, /followed|\.team[^{]*\{[^}]*(background|font-weight:[5-9]00|font-weight:bold)/i);
  const html = renderPage(DATA);
  assert.doesNotMatch(html, /class="team [^"]*"/);
});

test('internationals use day sub-labels (not headings) and chronological followed rows', () => {
  const html = renderPage(DATA);
  const intl = html.slice(html.indexOf('<h2>Other UK'), html.indexOf('<h2>Premier League</h2>'));
  const days = [...intl.matchAll(/<p class="day">([^<]*)<\/p>/g)].map(m => m[1]);
  assert.deepEqual(days, ['Thursday 12 November', 'Friday 13 November', 'Sunday 15 November', 'Saturday 14 November'], 'followed block runs chronologically, then the rest block restarts');
  assert.match(intl, /Rest of Europe<\/span><span class="count">2 matches/);
});

test('postcodes show only under followed Cymru North clubs\' home games; unknown ones say "Postcode not found"', () => {
  const html = renderPage(DATA);
  const pcs = [...html.matchAll(/<div class="match">.*?<span class="team">([^<]*)<\/span><span class="v">v<\/span>.*?<div class="venue"><span class="ven">([^<]*)<\/span>(<span class="pc">([^<]*)<\/span>)?/gs)]
    .map(m => ({ home: m[1], venue: m[2], pc: m[4] ?? null }));
  const withPc = pcs.filter(p => p.pc);
  assert.deepEqual(withPc.map(p => [p.home, p.pc]).sort(), [['Brickfield Rangers', 'LL14 4HE'], ['Followed No Postcode', 'Postcode not found'], ['Holyhead Hotspur', 'LL65 2YE'], ['Holyhead Hotspur', 'LL65 2YE']]);
  // Only those four rows: three in Cymru North, one in the Welsh Cup. None anywhere else, including the FA Trophy
  // row that names a followed Cymru North club.
  const between = (a, b) => html.slice(html.indexOf(`<h2>${a}</h2>`), html.indexOf(`<h2>${b}</h2>`));
  const count = s => (s.match(/class="pc"/g) ?? []).length;
  assert.equal(count(html), 4);
  assert.equal(count(between('Novira Cymru North', 'FA Cup')), 3);
  assert.equal(count(between('FAW Welsh Cup', 'Before you travel')), 1);
  assert.equal(count(between('FA Trophy', 'FAW Welsh Cup')), 0);
  assert.equal(count(html.slice(0, html.indexOf('<h2>Novira Cymru North</h2>'))), 0);
  // Followed team playing away: no postcode. Non-followed home team: no postcode, venue TBC.
  assert.ok(pcs.find(p => p.home === 'Bala Town' && !p.pc && p.venue === 'TBC'));
  assert.ok(pcs.find(p => p.home === 'Llanuwchllyn' && !p.pc && p.venue === 'TBC'));
});

test('unknown times and venues show TBC; postponed games are marked and the time struck through', () => {
  const html = renderPage(DATA);
  assert.match(html, /<span class="t">TBC<\/span>/);
  assert.match(html, /<span class="tag tag-pp">Postponed<\/span>/);
  assert.match(html, /<span class="t"><s>15:00<\/s><\/span>/);
});

test('"Before you travel" is the last top-level accordion and holds the sources and checked-at time', () => {
  const html = renderPage(DATA);
  assert.match(html, /<details class="comp travel">\n<summary class="comp-h"><h2>Before you travel<\/h2><\/summary>/);
  assert.ok(html.lastIndexOf('<details class="comp') === html.indexOf('<details class="comp travel">'));
  for (const s of ['Source conflicts', 'Postponements', 'To be confirmed', 'Caveats', 'Sources', 'Checked at']) assert.match(html, new RegExp(`<p class="sub">${s}</p>`));
  assert.match(html, /2026-11-12 05:30 GMT \(UK time\)/);
});

test('design tokens, themes and responsive rules are present', () => {
  for (const v of ['#ECEFEA', '#F6F8F4', '#15231B', '#58695E', '#C8D1C7', '#146C43', '#0E1712', '#15211A', '#E6EEE7', '#94A69A', '#263830', '#5CC48A']) assert.ok(CSS.includes(v), v);
  assert.match(CSS, /prefers-color-scheme:dark/);
  assert.match(CSS, /data-theme="dark"/);
  assert.match(CSS, /data-theme="light"/);
  assert.match(CSS, /max-width:880px/);
  assert.match(CSS, /@media \(max-width:639px\)\{[^}]*\.row\{grid-template-columns:1fr/);
  assert.match(CSS, /grid-template-columns:7\.5rem minmax\(0,1\.7fr\) minmax\(0,1fr\)/);
  assert.match(CSS, /padding:28px 16px 56px/);
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
test('built index.html: no <details> is open, no h3, sections in order', { skip: !existsSync(REAL) && 'index.html has not been built' }, () => {
  const html = readFileSync(REAL, 'utf8');
  checkRules(html);
  assert.equal((html.match(/<details class="comp(?: travel)?">/g) ?? []).length + (html.match(/<section class="comp-empty">/g) ?? []).length, HEADINGS.length);
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
});

test('cup sections: round tags show, a cup with no ties is a plain heading, followed clubs lead', () => {
  const html = renderPage(DATA);
  assert.match(html, /<section class="comp-empty"><h2>FA Cup<\/h2><\/section>/);
  const trophy = html.slice(html.indexOf('<h2>FA Trophy</h2>'), html.indexOf('<h2>FAW Welsh Cup</h2>'));
  assert.equal((trophy.match(/Second Round Proper/g) ?? []).length, 2);
  assert.match(trophy, /Rest of the round/);
  assert.match(trophy, /<span class="tag">FA Trophy<\/span>/);
  const welsh = html.slice(html.indexOf('<h2>FAW Welsh Cup</h2>'), html.indexOf('<h2>Before you travel</h2>'));
  const order = [...welsh.matchAll(/<span class="team">([^<]*)<\/span><span class="v">v<\/span><span class="team">([^<]*)<\/span>/g)].map(m => `${m[1]} v ${m[2]}`);
  assert.deepEqual(order, ['Holyhead Hotspur v Blaen-y-Maes', 'Caerau Ely v Brickfield Rangers', 'Newtown v Caerphilly Athletic'], 'followed clubs in configured order, then the rest');
});

test('built data: no section with several games shows every kick-off time as TBC (guards against a parsing slip)', { skip: !existsSync(join(ROOT, 'data/fixtures.json')) && 'data not built' }, () => {
  const d = JSON.parse(readFileSync(join(ROOT, 'data/fixtures.json'), 'utf8'));
  for (const s of d.sections) {
    const live = s.fixtures.filter(f => f.status !== 'postponed');
    if (live.length >= 3) assert.ok(live.some(f => f.time), `${s.name}: every kick-off time is empty`);
  }
});
