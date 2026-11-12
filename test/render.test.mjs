import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage, partition, CSS, fixtureKey } from '../scripts/render.mjs';
import { DATA, fx, sec, pcs } from './_data.mjs';
import { outline } from './_outline.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** What the page should show for a data set: groups in order of first appearance, competitions in order, none hidden. */
function expected(data) {
  const shown = data.sections.filter(s => !s.hidden);
  const groups = [...new Set(shown.map(s => s.group))];
  return { groups, titles: groups.flatMap(g => shown.filter(s => s.group === g).map(s => s.name)), byGroup: Object.fromEntries(groups.map(g => [g, shown.filter(s => s.group === g).map(s => s.name)])) };
}
const unescape = s => s.replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const escHtml = s => s.replace(/&/g, '&amp;').replace(/'/g, '&#39;');
const h2s = html => [...html.matchAll(/<h2>([^<]*)<\/h2>/g)].map(m => unescape(m[1]));
const titles = html => [...html.matchAll(/<div class="comp-t" role="heading" aria-level="3">([^<]*)<\/div>/g)].map(m => unescape(m[1]));
/** The HTML of one competition, from its title to the next competition, group or the end. */
function comp(html, name) {
  const start = html.indexOf(`aria-level="3">${escHtml(name)}</div>`);
  assert.ok(start >= 0, `no competition titled ${name}`);
  const rest = html.slice(start + 10);
  const ends = ['class="comp-t"', '<details class="group', '</main>'].map(m => rest.indexOf(m)).filter(i => i >= 0);
  return html.slice(start, start + 10 + Math.min(...ends));
}
const teamsIn = html => [...html.matchAll(/<span class="team">([^<]*)<\/span><span class="v">v<\/span><span class="team">([^<]*)<\/span>/g)].map(m => `${unescape(m[1])} v ${unescape(m[2])}`);

function checkRules(html, data = DATA) {
  const exp = expected(data);
  assert.doesNotMatch(html, /<details\b[^>]*\bopen\b/i, 'no <details> may carry the open attribute');
  assert.doesNotMatch(html, /<details\b[^>]*\bopen\s*=/i);
  assert.doesNotMatch(html, /<h3\b/i, 'no h3 anywhere');
  assert.deepEqual(h2s(html), [...exp.groups, 'Before you travel'], 'group order');
  assert.deepEqual(titles(html), exp.titles, 'competition order within the groups');
  assert.doesNotMatch(html, /<(b|strong)\b/i, 'team names and rows are not bold');
  assert.doesNotMatch(html, /Rest of/, 'the "rest" line is called "Other fixtures"');
  assert.match(unescape(html), /All kick-off times are UK time\. Venues are the home club's ground\./);
  assert.match(html, /<h1>Week Ahead Fixtures<\/h1>/);
}

test('rendered page follows the layout rules', () => {
  checkRules(renderPage(DATA));
});

test('three top-level group accordions, each holding its shown competitions as nested accordions', () => {
  const html = renderPage(DATA);
  const exp = expected(DATA);
  const groups = [...html.matchAll(/<details class="group">\n<summary class="group-h"><div class="group-id">(?:<img[^>]*>)?<h2>([^<]*)<\/h2><\/div><\/summary>\n<div class="group-body">/g)].map(m => m[1]);
  assert.deepEqual(groups, ['International', 'Welsh', 'English', 'European clubs']);
  assert.deepEqual(groups, exp.groups);
  // Every competition sits inside a group body, never at the top level.
  const topLevelComp = html.slice(html.indexOf('<main>')).match(/<main>\n(?:(?!<details class="group)[\s\S])*?<details class="comp">/);
  assert.equal(topLevelComp, null, 'no competition accordion before the first group');
  for (const g of exp.groups) {
    const start = html.indexOf(`<h2>${g}</h2>`);
    const end = Math.min(...[...exp.groups, 'Before you travel'].filter(x => x !== g).map(x => html.indexOf(`<h2>${x}</h2>`)).filter(i => i > start));
    assert.deepEqual(titles(html.slice(start, end)), exp.byGroup[g], `${g} holds its own competitions`);
  }
  // Shown competitions with games are collapsed accordions; an unreadable one is a plain title with a warning.
  const accordions = [...html.matchAll(/<details class="comp">\n<summary class="comp-h"><div class="comp-id">(?:<img[^>]*>)?<div class="comp-t" role="heading" aria-level="3">([^<]*)<\/div><\/div><\/summary>/g)].map(m => unescape(m[1]));
  assert.deepEqual(accordions, exp.titles.filter(t => t !== 'FA Cup'));
  assert.match(html, /<section class="comp-empty"><div class="comp-id">(?:<img[^>]*>)?<div class="comp-t" role="heading" aria-level="3">FA Cup<\/div><\/div><p class="muted unavailable">Could not be read/);
});

test('"Before you travel" is the last top-level accordion and holds the sources and checked-at time', () => {
  const html = renderPage(DATA);
  assert.match(html, /<details class="group travel">\n<summary class="group-h"><h2>Before you travel<\/h2><\/summary>/);
  assert.ok(html.lastIndexOf('<details class="group') === html.indexOf('<details class="group travel">'));
  for (const s of ['Source conflicts', 'Postponements', 'To be confirmed', 'Caveats', 'Sources', 'Checked at']) assert.match(html, new RegExp(`<p class="sub">${s}</p>`));
  assert.match(html, /2026-11-12 05:30 GMT \(UK time\)/);
});

test('a competition with no named team involved is not rendered, nor mentioned in the travel notes', () => {
  const html = renderPage(DATA);
  for (const hidden of ['Championship', 'UEFA Europa League']) assert.doesNotMatch(html, new RegExp(`aria-level="3">${hidden}<`), `${hidden} is not rendered`);
  assert.ok(!teamsIn(html).some(t => /Lincoln City|Celta/.test(t)), 'none of their games are shown');
  assert.doesNotMatch(html, /hidden-section (note|conflict)/, 'their notes and conflicts stay out of the travel notes');
});

test('a group whose competitions are all hidden is not rendered either', () => {
  const data = structuredClone(DATA);
  for (const s of data.sections.filter(s => s.group === 'Welsh')) s.hidden = true;
  const html = renderPage(data);
  assert.deepEqual(h2s(html), ['International', 'English', 'European clubs', 'Before you travel']);
  assert.doesNotMatch(html, /group-empty"|Novira Cymru North|FAW Welsh Cup/);
  checkRules(html, data);
});

test('an unreadable competition stays visible, so its absence is never mistaken for "no games"', () => {
  const data = structuredClone(DATA);
  for (const s of data.sections.filter(s => s.group === 'Welsh')) { s.fixtures = []; s.hidden = true; }
  const cymru = data.sections.find(s => s.key === 'cymru-north');
  cymru.hidden = false; cymru.unavailable = true;
  const html = renderPage(data);
  assert.match(html, /<h2>Welsh<\/h2><\/div><\/summary>/);
  assert.match(html, /Novira Cymru North<\/div><\/div><p class="muted unavailable">Could not be read/);
  assert.doesNotMatch(html, /FAW Welsh Cup/);
});

test('what was left out is reported once, in the notes, so the absence is explained', () => {
  const data = structuredClone(DATA);
  data.hidden = ['Championship', 'UEFA Europa League'];
  assert.match(renderPage(data), /Not shown this week, because none of the named teams \(config\/teams\.json\) are involved: Championship, UEFA Europa League\./);
  data.hidden = [];
  assert.doesNotMatch(renderPage(data), /Not shown this week/);
});

test('a competition logo is shown beside its title as a decorative image; white logos get the dark backing', () => {
  const html = renderPage(DATA);
  const pl = comp(html, 'Premier League');
  assert.match(html, /<div class="comp-id"><img class="comp-logo" src="assets\/logos\/premier-league\.png" alt="" width="30" height="30" loading="lazy" decoding="async"><div class="comp-t" role="heading" aria-level="3">Premier League<\/div><\/div>/);
  assert.match(html, /<img class="comp-logo comp-logo--dark" src="assets\/logos\/wales\.svg" alt=""/);
  assert.equal((html.match(/<img class="comp-logo/g) ?? []).length, 2, 'only competitions with a logo get an image');
  assert.doesNotMatch(comp(html, 'League One'), /<img /);
  assert.doesNotMatch(html, /src="(?:https?:)?\//, 'logo paths are relative to the page, so Pages serves them from the same place');
  assert.match(CSS, /\.comp-logo\{[^}]*background:#fff/);
  assert.match(CSS, /\.comp-logo--dark,\.group-logo--dark\{background:#15231B\}/);
  assert.ok(pl.length > 0);
});

test('an unreadable competition keeps its logo too', () => {
  const data = structuredClone(DATA);
  Object.assign(data.sections.find(s => s.key === 'fa-cup'), { logo: 'assets/logos/fa-cup.png' });
  assert.match(renderPage(data), /<section class="comp-empty"><div class="comp-id"><img class="comp-logo" src="assets\/logos\/fa-cup\.png"/);
});

test('a group\'s icon sits in its header, inside the summary, beside the h2; the travel accordion has none', () => {
  const html = renderPage(DATA);
  assert.match(html, /<summary class="group-h"><div class="group-id"><img class="group-logo" src="assets\/logos\/group-international\.svg" alt="" width="44" height="44" decoding="async"><h2>International<\/h2><\/div><\/summary>/);
  assert.match(html, /<img class="group-logo group-logo--purple" src="assets\/logos\/group-english\.png" alt=""[^>]*><h2>English<\/h2>/);
  assert.match(html, /<img class="group-logo group-logo--navy group-logo--ball" src="assets\/logos\/group-european-clubs\.svg" alt=""[^>]*><h2>European clubs<\/h2>/);
  assert.match(html, /<summary class="group-h"><div class="group-id"><h2>Welsh<\/h2><\/div><\/summary>/, 'a group with no icon configured still renders');
  assert.match(html, /<summary class="group-h"><h2>Before you travel<\/h2><\/summary>/);
  assert.equal((html.match(/class="group-logo/g) ?? []).length, 3);
  assert.doesNotMatch(html, /<img[^>]*group-logo[^>]*src="(?:https?:)?\//, 'icon paths are relative to the page');
});

test('chip colours are defined after their base rule, so a brand-coloured chip is never overridden by the white default', () => {
  for (const [base, chips] of [['.group-logo{', ['.group-logo--dark', '.group-logo--purple', '.group-logo--navy']], ['.comp-logo{', ['.comp-logo--dark', '.comp-logo--purple', '.comp-logo--navy']]]) {
    const b = CSS.indexOf(base);
    assert.ok(b >= 0, base);
    for (const chip of chips) {
      const at = CSS.indexOf(chip);
      assert.ok(at > b, `${chip} must come after ${base}`);
      assert.match(CSS.slice(at, at + 200), /background:#[0-9a-f]{6}/i);
    }
  }
  assert.match(CSS, /\.group-logo--purple\{background:#38003c\}/);
  assert.match(CSS, /\.group-logo--navy\{background:#0a1b3d\}/);
  assert.match(CSS, /\.group-logo--ball\{object-view-box:inset\(/);
});

test('an unknown chip name is ignored rather than written into the markup', () => {
  const data = structuredClone(DATA);
  data.groupLogos.Welsh = { src: 'assets/logos/group-welsh.svg', chip: 'x" onerror="alert(1)' };
  const html = renderPage(data);
  assert.doesNotMatch(html, /onerror/);
  assert.match(html, /<img class="group-logo" src="assets\/logos\/group-welsh\.svg"/);
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
test('built index.html: nothing open, no h3, groups and competitions match what the build marked as shown', { skip: !existsSync(REAL) && 'index.html has not been built' }, () => {
  const html = readFileSync(REAL, 'utf8');
  const data = JSON.parse(readFileSync(join(ROOT, 'data/fixtures.json'), 'utf8'));
  checkRules(html, data);
  assert.equal((html.match(/<details class="group(?: travel)?">/g) ?? []).length, expected(data).groups.length + 1);
  assert.doesNotMatch(html, /group-empty"/);
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
  assert.deepEqual([...new Set(d.sections.map(s => s.group))], ['International', 'Welsh', 'English', 'European clubs']);
  for (const sec of d.sections) assert.equal(typeof !!sec.hidden, 'boolean');
});

test('built data: no section with several games shows every kick-off time as TBC (guards against a parsing slip)', { skip: !existsSync(join(ROOT, 'data/fixtures.json')) && 'data not built' }, () => {
  const d = JSON.parse(readFileSync(join(ROOT, 'data/fixtures.json'), 'utf8'));
  for (const s of d.sections) {
    const live = s.fixtures.filter(f => f.status !== 'postponed');
    if (live.length >= 3) assert.ok(live.some(f => f.time), `${s.name}: every kick-off time is empty`);
  }
});
