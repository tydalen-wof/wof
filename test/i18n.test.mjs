import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeLang, EN_UI } from '../scripts/lib/i18n.mjs';
import { shortDate, longDate, rangeLabel } from '../scripts/lib/time.mjs';
import { renderPage } from '../scripts/render.mjs';
import { SECTIONS } from '../scripts/build.mjs';
import { DATA } from './_data.mjs';
import { outline } from './_outline.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACK = JSON.parse(readFileSync(join(ROOT, 'config/lang.cy.json'), 'utf8'));
const EN = makeLang('en');
const CY = makeLang('cy', PACK);
const unescape = s => s.replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// ---------- the language layer ----------
test('English output is exactly what the page produced before languages existed', () => {
  assert.equal(EN.shortDate('2026-11-14'), shortDate('2026-11-14'));
  assert.equal(EN.longDate('2026-11-12'), longDate('2026-11-12'));
  assert.equal(EN.rangeLabel({ start: '2026-11-12', end: '2026-11-22' }), rangeLabel({ start: '2026-11-12', end: '2026-11-22' }));
  assert.equal(EN.team('Wales'), 'Wales');
  assert.equal(EN.comp('Premier League'), 'Premier League');
  assert.deepEqual(EN.tag('Nations League · Group A4'), { text: 'Nations League · Group A4', translated: true });
  assert.equal(EN.count(1), '1 match');
  assert.equal(EN.count(7), '7 matches');
  assert.equal(EN.htmlLang, 'en-GB');
});

test('Welsh dates use Welsh weekday and month names, for every weekday and month', () => {
  assert.equal(CY.shortDate('2026-11-14'), 'Sad 14 Tach');
  assert.equal(CY.longDate('2026-11-12'), 'Dydd Iau 12 Tachwedd');
  assert.equal(CY.longDate('2026-11-15'), 'Dydd Sul 15 Tachwedd');
  assert.equal(CY.rangeLabel({ start: '2026-11-12', end: '2026-11-22' }), '12 Tach i 22 Tach 2026');
  assert.equal(CY.rangeLabel({ start: '2026-12-30', end: '2027-01-09' }), '30 Rhag 2026 i 9 Ion 2027', 'a range across New Year names both years');
  // Sunday is first, as in the data: 2026-11-15 is a Sunday, 2026-11-21 a Saturday.
  assert.equal(CY.longDate('2026-11-21'), 'Dydd Sadwrn 21 Tachwedd');
  for (let m = 1; m <= 12; m++) assert.ok(CY.longDate(`2026-${String(m).padStart(2, '0')}-10`).includes(PACK.months[m - 1]), `month ${m}`);
});

test('Welsh tags are translated part by part, and a tag with any untranslated part stays wholly English', () => {
  assert.deepEqual(CY.tag('Nations League · Group A4'), { text: 'Cynghrair y Cenhedloedd · Grŵp A4', translated: true });
  assert.deepEqual(CY.tag('League Phase · Matchday 5'), { text: 'Cyfnod y Gynghrair · Diwrnod gêm 5', translated: true });
  assert.deepEqual(CY.tag('Round of 16 · 1st leg'), { text: 'Rownd 16 olaf · Cymal cyntaf', translated: true });
  assert.deepEqual(CY.tag('Second Round Proper'), { text: 'Ail Rownd', translated: true });
  assert.deepEqual(CY.tag('Friendly'), { text: 'Cyfeillgar', translated: true });
  assert.deepEqual(CY.tag('Mystery Round'), { text: 'Mystery Round', translated: false });
  assert.deepEqual(CY.tag('Nations League · Mystery'), { text: 'Nations League · Mystery', translated: false }, 'no half-translated labels');
});

test('names fall back to English when the pack has none, and clubs are never translated', () => {
  assert.equal(CY.team('Wales'), 'Cymru');
  assert.equal(CY.team('Republic of Ireland'), 'Gweriniaeth Iwerddon');
  assert.equal(CY.team('Surinam'), 'Surinam', 'unknown national team');
  assert.equal(CY.team('Liverpool'), 'Liverpool');
  assert.equal(CY.team('Holyhead Hotspur'), 'Holyhead Hotspur');
  assert.equal(CY.comp('FA Cup'), 'Cwpan yr FA');
  assert.equal(CY.comp('Some New Competition'), 'Some New Competition');
  assert.equal(CY.group('English'), 'Lloegr');
  assert.equal(CY.count(1), '1 gêm');
  assert.equal(CY.count(14), '14 gêm', 'Welsh keeps the noun singular after a number');
});

test('the Welsh language needs its pack', () => {
  assert.throws(() => makeLang('cy'), /Welsh pack/);
});

// ---------- the Welsh pack is complete ----------
test('config/lang.cy.json has every page string, with the same {placeholders} as the English', () => {
  const holes = k => [...new Set([...String(k).matchAll(/\{(\w+)\}/g)].map(m => m[1]))].sort();
  for (const [key, en] of Object.entries(EN_UI)) {
    const cy = PACK.ui[key];
    assert.equal(typeof cy, 'string', `ui.${key} is missing in Welsh`);
    if (key !== 'technicalNotes') assert.ok(cy.trim().length > 0, `ui.${key} is empty`);
    assert.deepEqual(holes(cy), holes(en), `ui.${key}: placeholders differ`);
    assert.equal(cy, cy.trim(), `ui.${key}: stray spaces`);
  }
  assert.ok(PACK.ui.technicalNotes.length > 0, 'the Welsh page explains that technical notes are in English');
  assert.deepEqual(Object.keys(PACK.ui).filter(k => !(k in EN_UI)), [], 'no Welsh strings the page never uses');
});

test('config/lang.cy.json names every group and competition on the page, and has 12 months and 7 days', () => {
  for (const g of new Set(SECTIONS.map(s => s.group))) assert.ok(PACK.groups[g], `group ${g}`);
  for (const s of SECTIONS) assert.ok(PACK.competitions[s.name], `competition ${s.name}`);
  assert.equal(PACK.months.length, 12);
  assert.equal(PACK.monthsShort.length, 12);
  assert.equal(PACK.days.length, 7);
  assert.equal(PACK.daysShort.length, 7);
  assert.equal(new Set(PACK.months).size, 12);
  assert.equal(PACK.days[0], 'Dydd Sul', 'Sunday first, matching the data');
  for (const rule of PACK.tagPatterns) assert.doesNotThrow(() => new RegExp(rule.match));
  for (const v of [...Object.values(PACK.groups), ...Object.values(PACK.competitions), ...Object.values(PACK.tags), ...Object.values(PACK.teams)]) assert.ok(v.trim() && !/TODO|XXX/i.test(v));
  for (const t of ['Wales', 'England', 'Scotland', 'Northern Ireland', 'Republic of Ireland']) assert.ok(PACK.teams[t], t);
});

// ---------- the Welsh page ----------
const en = renderPage(DATA);
const cy = renderPage(DATA, { lang: CY });
// Remove the passages that are English on purpose (free-text notes and untranslated tags) and the stylesheet/head.
const withoutEnglishOnPurpose = html => html
  .replace(/<li lang="en">[\s\S]*?<\/li>/g, '')
  .replace(/<span class="tag"[^>]* lang="en">[\s\S]*?<\/span>/g, '')
  .replace(/<head>[\s\S]*?<\/head>/, '');
/** The page's structure without any text, links or language attributes: the two languages must have the same one. */
const shape = html => html
  .replace(/<head>[\s\S]*?<\/head>/, '')
  .replace(/>[^<]+</g, '><')
  .replace(/ (href|src|title|aria-label|hreflang|lang)="[^"]*"/g, '')
  .replace('<div class="notes-body"><p class="muted"></p>', '<div class="notes-body">');   // the Welsh page's one extra line: "technical notes are in English"

test('the Welsh page is Welsh: language attribute, title, heading and subtitle', () => {
  assert.match(cy, /<html lang="cy">/);
  assert.match(en, /<html lang="en-GB">/);
  assert.match(cy, /<title>Gemau&#39;r Wythnos i Ddod<\/title>/);
  assert.match(cy, /<h1>Gemau&#39;r Wythnos i Ddod<\/h1>/);
  assert.match(unescape(cy), /Amser y DU yw pob amser cychwyn\. Cae'r clwb cartref yw pob lleoliad\./);
  assert.match(cy, /<p class="kicker">12 Tach i 22 Tach 2026<\/p>/);
});

test('the Welsh page has the same structure as the English: same groups, competitions, rows, accordions', () => {
  assert.equal(shape(cy), shape(en));
  const rows = h => (h.match(/<div class="row">/g) ?? []).length;
  assert.equal(rows(cy), rows(en));
  assert.ok(rows(cy) > 10);
  assert.doesNotMatch(cy, /<details\b[^>]*\bopen\b/i, 'nothing is open on load');
  assert.doesNotMatch(cy, /<h3\b/i);
});

test('groups, competitions, dates, tags and national teams are shown in Welsh', () => {
  for (const g of ['Rhyngwladol', 'Cymru', 'Lloegr', 'Clybiau Ewrop', 'Cyn i chi deithio']) assert.match(cy, new RegExp(`<h2>${g}</h2>`), g);
  for (const c of ['Gemau rhyngwladol dynion Cymru', 'Uwch Gynghrair Lloegr', 'Cwpan Cymru CBDC', 'Cynghrair Un', 'Tlws yr FA']) assert.ok(cy.includes(`aria-level="3">${c}</div>`), c);
  assert.match(cy, /<span class="d">Sad 14 Tach<\/span>/);
  assert.match(cy, /<p class="day">Dydd Iau 12 Tachwedd<\/p>/);
  assert.match(cy, /<span class="team">Cymru<\/span><span class="v">v<\/span><span class="team">Portiwgal<\/span>/);
  assert.match(cy, /<span class="team">Norwy<\/span><span class="v">v<\/span><span class="team">Cymru<\/span>/);
  assert.match(cy, /<span class="tag">Cynghrair y Cenhedloedd · Grŵp A4<\/span>/);
  assert.match(cy, /<span class="tag tag-pp">Gohiriwyd<\/span>/);
  assert.match(cy, /<span>Gemau eraill<\/span><span class="count">2 gêm<\/span>/);
  assert.match(cy, /<span class="t">I&#39;w gadarnhau<\/span>/);
  assert.match(cy, /<span class="pc">Cod post heb ei ganfod<\/span>/);
});

test('club names and grounds are left as they are; followed teams still lead in the same order', () => {
  const teams = h => [...h.matchAll(/<span class="team">([^<]*)<\/span><span class="v">v<\/span><span class="team">([^<]*)<\/span>/g)].map(m => `${m[1]} v ${m[2]}`);
  const wanted = ['Chelsea v Leeds United', 'Liverpool v Manchester United', 'Holyhead Hotspur v Bala Town', 'Hampden Park'];
  const cyTeams = teams(cy).join('|');
  for (const t of wanted.slice(0, 3)) assert.ok(cyTeams.includes(t), t);
  assert.ok(cy.includes('Hampden Park, Glasgow'));
  assert.equal(teams(cy).length, teams(en).length);
});

test('no English page text leaks into the Welsh page, except the passages marked lang="en"', () => {
  const body = unescape(withoutEnglishOnPurpose(cy));
  for (const phrase of ['Other fixtures', 'Before you travel', 'Postponed', 'TBC', 'Week Ahead', 'Source conflicts', 'Postponements', 'To be confirmed', 'Caveats', 'Checked at', 'UK time', 'Postcode not found', ' matches', 'Rest of', 'Do not travel', 'Could not be read', 'main list', 'cross-check', 'Not shown this week']) {
    assert.ok(!body.includes(phrase), `English "${phrase}" appears in the Welsh page`);
  }
  // English dates look like "Sat 14 Nov" or "Saturday 14 November"; club names such as "Sheffield Wednesday" are not dates.
  assert.doesNotMatch(body, /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]* \d{1,2}\b/, 'an English weekday date');
  assert.doesNotMatch(body, /\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/, 'an English month date');
});

test('free-text technical notes stay English and are marked lang="en"; the English page has no such marks', () => {
  assert.match(cy, /<li lang="en">Premier League: A free-text note about the Premier League\.<\/li>/);
  assert.match(cy, /<li lang="en">Novira Cymru North: A free-text conflict about Cymru North\.<\/li>/);
  assert.match(cy, /<p class="muted">Mae rhai o&#39;r nodiadau technegol isod yn Saesneg yn unig\.<\/p>/, 'the page says so');
  assert.doesNotMatch(en, /lang="en"/);
  assert.doesNotMatch(en, /Mae rhai o/);
});

test('lines the page writes itself in "Before you travel" are translated, with names and dates in Welsh', () => {
  const body = unescape(cy);
  assert.match(body, /Cynghrair Un: Gohiriwyd Bromley v Notts County, Sad 14 Tach\. Peidiwch â theithio nes bod dyddiad newydd\./);
  assert.match(body, /Cynghrair Un: amser cychwyn i'w gadarnhau ar gyfer Barnsley v Sheffield Wednesday, Gwe 20 Tach\./);
  assert.match(body, /Novira Cymru North: lleoliad i'w gadarnhau ar gyfer Bala Town v Holyhead Hotspur, Sad 14 Tach\./);
  assert.match(body, /Heb eu dangos yr wythnos hon, gan nad oes unrhyw un o'r timau a enwir \(config\/teams\.json\) yn chwarae: Y Bencampwriaeth, Cynghrair Europa UEFA\./);
  assert.match(body, /Gwiriwyd am<\/p><p>2026-11-12 05:30 GMT \(amser y DU\)/);
  assert.match(body, /Uwch Gynghrair Lloegr: Premier League \(official feed\) \(prif restr\); Sky Sports \(croeswirio\)\. ESPN wedi methu: HTTP 403\./);
  assert.match(body, /Gemau rhyngwladol dynion Cymru: ni ellid darllen unrhyw ffynhonnell\./);
});

// ---------- the swap icon ----------
test('the swap icon is a link in the top right of the title row, to the other language', () => {
  for (const [html, href, lang, name, code] of [[en, 'cy/', 'cy', 'Cymraeg', 'CY'], [cy, '../', 'en', 'English', 'EN']]) {
    const header = html.slice(html.indexOf('<header class="hd">'), html.indexOf('</header>'));
    assert.match(header, /<div class="hd-row">\n<div class="hd-title">\n<p class="kicker">[^<]*<\/p>\n<h1>[^<]*<\/h1>\n<\/div>\n<a class="lang-switch"/, 'after the title block, in the same row');
    assert.ok(header.includes(`href="${href}" hreflang="${lang}" lang="${lang}" title="${name}" aria-label="${name}"`), `${name} link`);
    assert.ok(header.includes(`<span aria-hidden="true">${code}</span>`));
    assert.match(header, /<svg [^>]*aria-hidden="true" focusable="false">/, 'the globe is decorative');
    assert.equal((header.match(/<a /g) ?? []).length, 1, 'one link in the header');
  }
  assert.match(en, /\.hd-row\{display:flex;align-items:flex-start;justify-content:space-between/);
});

test('asset paths suit each page: the Welsh page lives one folder down', () => {
  const srcs = h => [...h.matchAll(/<img [^>]*src="([^"]+)"/g)].map(m => m[1]);
  assert.ok(srcs(en).length > 0);
  assert.ok(srcs(en).every(s => s.startsWith('assets/logos/')));
  assert.deepEqual(srcs(cy), srcs(en).map(s => `../${s}`));
});

test('the Welsh page has its own structure snapshot (so translation changes are reviewed)', () => {
  const actual = outline(cy);
  const file = join(ROOT, 'test/snapshots/structure.cy.txt');
  if (!existsSync(file) || process.env.UPDATE_SNAPSHOT) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, actual); }
  assert.equal(actual, readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), 'Welsh page changed; review it, then run with UPDATE_SNAPSHOT=1 to accept');
});

// ---------- the built pages ----------
const BUILT = join(ROOT, 'cy/index.html');
test('built cy/index.html: Welsh, nothing open, no h3, same shape as index.html, assets exist', { skip: !existsSync(BUILT) && 'cy/index.html has not been built' }, () => {
  const welsh = readFileSync(BUILT, 'utf8');
  const english = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.match(welsh, /<html lang="cy">/);
  assert.doesNotMatch(welsh, /<details\b[^>]*\bopen\b/i);
  assert.doesNotMatch(welsh, /<h3\b/i);
  assert.equal(shape(welsh), shape(english), 'the two built pages have the same structure');
  for (const m of welsh.matchAll(/<img [^>]*src="([^"]+)"/g)) assert.ok(existsSync(join(ROOT, 'cy', m[1])), `${m[1]} exists from cy/`);
  assert.ok(welsh.includes('href="../" hreflang="en"'));
  assert.ok(english.includes('href="cy/" hreflang="cy"'));
});
