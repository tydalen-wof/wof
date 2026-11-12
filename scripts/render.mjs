// Pure function: report data -> one self-contained HTML page (no <details> is ever rendered open).
import { teamKey } from './lib/teams.mjs';
import { NOT_FOUND } from './lib/postcodes.mjs';
import { makeLang } from './lib/i18n.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500&display=swap';

export const CSS = `
:root{--bg:#ECEFEA;--surface:#F6F8F4;--fg:#15231B;--muted:#58695E;--line:#C8D1C7;--accent:#146C43;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0E1712;--surface:#15211A;--fg:#E6EEE7;--muted:#94A69A;--line:#263830;--accent:#5CC48A;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0E1712;--surface:#15211A;--fg:#E6EEE7;--muted:#94A69A;--line:#263830;--accent:#5CC48A;color-scheme:dark}
:root[data-theme="light"]{--bg:#ECEFEA;--surface:#F6F8F4;--fg:#15231B;--muted:#58695E;--line:#C8D1C7;--accent:#146C43;color-scheme:light}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:400 16px/1.45 "IBM Plex Sans","Helvetica Neue",Arial,sans-serif}
.wrap{max-width:880px;margin:0 auto;padding:28px 16px 56px}
.hd{margin-bottom:22px}
.kicker{margin:0 0 4px;font:600 .95rem/1 "Barlow Condensed","Arial Narrow","Helvetica Neue",Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
h1{margin:0;font:700 clamp(2.4rem,8vw,3.6rem)/.95 "Barlow Condensed","Arial Narrow","Helvetica Neue",Arial,sans-serif;letter-spacing:.01em;text-transform:uppercase}
.lede{margin:10px 0 0;color:var(--muted)}
.hd-row{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
.hd-title{min-width:0}
.lang-switch{flex:none;display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--accent);text-decoration:none;font:600 .9rem/1 "Barlow Condensed","Arial Narrow","Helvetica Neue",Arial,sans-serif;letter-spacing:.1em}
.lang-switch:hover{border-color:var(--accent)}
.lang-switch:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.lang-switch svg{display:block}
h2{margin:0;font:700 1.7rem/1.05 "Barlow Condensed","Arial Narrow","Helvetica Neue",Arial,sans-serif;letter-spacing:.02em;text-transform:uppercase}
.group{margin:12px 0;background:var(--surface);border:1px solid var(--line);border-radius:4px}
.group-body{border-top:1px solid var(--line);padding:12px}
.group-body>.comp,.group-body>.comp-empty{margin:0 0 10px;background:var(--bg)}
.group-body>:last-child{margin-bottom:0}
.comp{margin:12px 0;background:var(--surface);border:1px solid var(--line);border-radius:4px}
.comp-empty{margin:12px 0;padding:14px 16px;border:1px solid var(--line);border-radius:4px;background:var(--surface)}
.comp-id{display:flex;align-items:center;gap:10px;min-width:0}
.comp-logo{flex:none;width:30px;height:30px;object-fit:contain;background:#fff;border:1px solid var(--line);border-radius:5px;padding:3px}
.group-id{display:flex;align-items:center;gap:14px;min-width:0}
.group-logo{flex:none;width:44px;height:44px;object-fit:contain;background:#fff;border:1px solid var(--line);border-radius:8px;padding:5px}
.comp-logo--dark,.group-logo--dark{background:#15231B}
.comp-logo--purple,.group-logo--purple{background:#38003c}
.comp-logo--navy,.group-logo--navy{background:#0a1b3d}
.group-logo--ball{object-view-box:inset(0 22% 46% 22%)}
.comp-t{font:700 1.4rem/1.05 "Barlow Condensed","Arial Narrow","Helvetica Neue",Arial,sans-serif;letter-spacing:.02em;text-transform:uppercase}
summary{cursor:pointer;list-style:none}
summary::-webkit-details-marker{display:none}
summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.group-h,.comp-h{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px}
.group-h::after,.comp-h::after,.rest-line::after{content:"+";flex:none;width:1.4rem;height:1.4rem;line-height:1.3rem;text-align:center;border:1px solid var(--line);border-radius:3px;color:var(--accent);font:600 1.1rem/1.3rem "IBM Plex Sans",Arial,sans-serif}
details[open]>.group-h::after,details[open]>.comp-h::after,details[open]>summary .rest-line::after{content:"\\2212"}
.comp-body{border-top:1px solid var(--line)}
.rest>summary{display:block}
.rest-line{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-top:1px solid var(--line);color:var(--muted);font-size:.92rem}
.rest-line .count{margin-left:auto;margin-right:8px}
.row{display:grid;grid-template-columns:7.5rem minmax(0,1.7fr) minmax(0,1fr);gap:4px 16px;padding:11px 16px;border-top:1px solid var(--line)}
.comp-body>.row:first-child,.comp-body>.day:first-child{border-top:0}
.rest-body{border-top:1px solid var(--line)}
.when .d{display:block;color:var(--muted);font-size:.85rem}
.when .t{display:block;font:600 1.25rem/1.1 "Barlow Condensed","Arial Narrow","Helvetica Neue",Arial,sans-serif;letter-spacing:.02em}
.match{overflow-wrap:anywhere}
.team{font-weight:400}
.v{color:var(--muted);padding:0 .25em}
.tags{display:block;margin-top:3px}
.tag{display:inline-block;margin:0 4px 2px 0;padding:1px 6px;border:1px solid var(--line);border-radius:2px;color:var(--muted);font-size:.68rem;line-height:1.5;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}
.tag-pp{color:var(--fg);border-color:var(--fg)}
.ven{display:block;color:var(--muted);font-size:.92rem}
.pc{display:block;color:var(--muted);font-size:.82rem}
.day{margin:0;padding:9px 16px 7px;border-top:1px solid var(--line);color:var(--accent);font:600 .95rem/1 "Barlow Condensed","Arial Narrow","Helvetica Neue",Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase}
.notes-body{padding:0 4px 8px}
.sub{margin:16px 0 4px;color:var(--accent);font:600 .95rem/1 "Barlow Condensed","Arial Narrow","Helvetica Neue",Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase}
.notes-body ul{margin:4px 0 0;padding-left:1.1rem}
.notes-body li{margin:3px 0;color:var(--fg);font-size:.92rem}
.notes-body p{margin:6px 0;font-size:.92rem}
.muted{color:var(--muted)}
.unavailable{margin:6px 0 0;font-size:.92rem}
@media (max-width:639px){
  .row{grid-template-columns:1fr;gap:3px;padding:12px 16px}
  .when .d,.when .t{display:inline}
  .when .d{margin-right:.6em}
}
`;

// ---------- rows ----------
// A tag that has no Welsh is shown in English and marked lang="en", so assistive technology reads it correctly.
const tag = (text, cls = '', english = false) => `<span class="tag${cls ? ' ' + cls : ''}"${english ? ' lang="en"' : ''}>${esc(text)}</span>`;

/** The build works out each fixture's postcode text (or "Postcode not found"); the page only displays it. */
export const fixtureKey = f => `${f.date}|${f.home}|${f.away}`;
function postcodeFor(f, ctx) {
  const text = ctx.postcodes?.[fixtureKey(f)];
  return text ? `<span class="pc">${esc(text === NOT_FOUND ? ctx.L.ui('postcodeNotFound') : text)}</span>` : '';
}

function row(f, ctx) {
  const { L } = ctx;
  const pp = f.status === 'postponed';
  const time = f.time ?? L.ui('tbc');
  const t = f.tag ? L.tag(f.tag) : null;
  const tags = [t ? tag(t.text, '', !t.translated) : '', pp ? tag(L.ui('postponed'), 'tag-pp') : ''].join('');
  return `<div class="row">
<div class="when"><span class="d">${esc(L.shortDate(f.date))}</span><span class="t">${pp ? `<s>${esc(time)}</s>` : esc(time)}</span></div>
<div class="match"><span class="team">${esc(L.team(f.home))}</span><span class="v">v</span><span class="team">${esc(L.team(f.away))}</span>${tags ? `<span class="tags">${tags}</span>` : ''}</div>
<div class="venue"><span class="ven">${esc(f.venue ?? L.ui('tbc'))}</span>${postcodeFor(f, ctx)}</div>
</div>`;
}

function rowsWithDays(list, ctx) {
  let out = '', last = null;
  for (const f of list) {
    if (f.date !== last) { out += `<p class="day">${esc(ctx.L.longDate(f.date))}</p>\n`; last = f.date; }
    out += row(f, ctx) + '\n';
  }
  return out;
}

const byWhen = (a, b) => a.date.localeCompare(b.date) || (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || a.home.localeCompare(b.home);

/** Followed teams in configured order (a game with two followed teams appears once), then everyone else. */
export function partition(fixtures, followed, { chronological = false } = {}) {
  const keys = followed.map(teamKey);
  const rank = f => {
    const r = [keys.indexOf(teamKey(f.home)), keys.indexOf(teamKey(f.away))].filter(i => i >= 0);
    return r.length ? Math.min(...r) : -1;
  };
  const mine = fixtures.filter(f => rank(f) >= 0).sort((a, b) => (chronological ? 0 : rank(a) - rank(b)) || byWhen(a, b));
  const rest = fixtures.filter(f => rank(f) < 0).sort(byWhen);
  return { mine, rest };
}

// ---------- competitions ----------
// A competition's title is not an <h2>/<h3>: the group above it owns the <h2>, and the page has no h3 at all.
// role="heading" aria-level="3" gives assistive technology the same outline.
const compTitle = name => `<div class="comp-t" role="heading" aria-level="3">${esc(name)}</div>`;
// The logo is decorative (the title beside it names the competition), so its alt text is empty.
const CHIPS = ['dark', 'purple', 'navy'];                 // backings for logos drawn in white or on a brand colour; default is white
const chipClass = (prefix, chip) => (CHIPS.includes(chip) ? ` ${prefix}--${chip}` : '');
const logoImg = (s, L) => (s.logo ? `<img class="comp-logo${chipClass('comp-logo', s.logoChip)}" src="${esc(L.assetBase + s.logo)}" alt="" width="30" height="30" loading="lazy" decoding="async">` : '');
const compHead = (s, L) => `<div class="comp-id">${logoImg(s, L)}${compTitle(L.comp(s.name))}</div>`;

function plainHeading(s, L, unavailable = false) {
  const why = unavailable ? `<p class="muted unavailable">${esc(L.ui('unavailable'))}</p>` : '';
  return `<section class="comp-empty">${compHead(s, L)}${why}</section>`;
}

function accordion(s, body, L) {
  return `<details class="comp">
<summary class="comp-h">${compHead(s, L)}</summary>
<div class="comp-body">
${body}</div>
</details>`;
}

function nested(mine, rest, renderList, ctx) {
  if (!rest.length) return renderList(mine, ctx);
  const line = `<div class="rest-line"><span>${esc(ctx.L.ui('other'))}</span><span class="count">${esc(ctx.L.count(rest.length))}</span></div>`;
  return `<details class="rest">
<summary class="rest-s">
${renderList(mine, ctx)}${line}
</summary>
<div class="rest-body">
${renderList(rest, ctx)}</div>
</details>
`;
}

const plainList = (list, ctx) => list.map(f => row(f, ctx)).join('\n') + (list.length ? '\n' : '');

function renderSection(s, L) {
  const fixtures = s.fixtures ?? [];
  if (!fixtures.length) return plainHeading(s, L, s.unavailable);
  const c = { postcodes: s.postcodes ?? null, L };
  if (s.layout === 'plain') return accordion(s, plainList([...fixtures].sort(byWhen), c), L);
  const { mine, rest } = partition(fixtures, s.followed ?? [], { chronological: s.layout === 'days' });
  return accordion(s, nested(mine, rest, s.layout === 'days' ? rowsWithDays : plainList, c), L);
}

// ---------- groups ----------
/** A top-level accordion holding competition accordions. (Groups are only built from competitions that are shown.) */
function renderGroup(name, sections, logo, L) {
  // The group's icon sits in its header: clicking the icon (or the title) opens the group's competition cards.
  const img = logo?.src
    ? `<img class="group-logo${chipClass('group-logo', logo.chip)}${logo.crop === 'ball' ? ' group-logo--ball' : ''}" src="${esc(L.assetBase + logo.src)}" alt="" width="44" height="44" decoding="async">`
    : '';
  return `<details class="group">
<summary class="group-h"><div class="group-id">${img}<h2>${esc(L.group(name))}</h2></div></summary>
<div class="group-body">
${sections.map(s => renderSection(s, L)).join('\n')}
</div>
</details>`;
}

/** Groups appear in the order their first section appears. A section with no group stands alone at the top level. */
function renderSections(sections, groupLogos, L) {
  const out = [];
  const seen = new Map();
  for (const s of sections) {
    if (!s.group) { out.push(renderSection(s, L)); continue; }
    if (!seen.has(s.group)) { seen.set(s.group, []); out.push({ group: s.group }); }
    seen.get(s.group).push(s);
  }
  return out.map(o => (typeof o === 'string' ? o : renderGroup(o.group, seen.get(o.group), groupLogos?.[o.group], L))).join('\n');
}

// ---------- travel notes ----------
// Lines the page builds itself are translated. Free-text notes written by the collectors are English; on the Welsh page
// each such line is marked lang="en".
const li = items => (items.length ? `<ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : '');
const liEn = (items, L) => (items.length ? `<ul>${items.map(i => `<li${L.code === 'en' ? '' : ' lang="en"'}>${esc(i)}</li>`).join('')}</ul>` : '');

function travelBody(data, L) {
  const secs = data.sections;
  const all = secs.flatMap(s => (s.fixtures ?? []).map(f => ({ ...f, section: L.comp(s.name) })));
  const label = f => `${L.team(f.home)} v ${L.team(f.away)}, ${L.shortDate(f.date)}`;
  let h = '<div class="notes-body">\n';
  if (L.ui('technicalNotes')) h += `<p class="muted">${esc(L.ui('technicalNotes'))}</p>`;

  h += `<p class="sub">${esc(L.ui('subConflicts'))}</p>`;
  const conflicts = secs.flatMap(s => (s.conflicts ?? []).filter(c => c.kind !== 'venue').map(c => `${s.name}: ${c.text}`));
  // Venue wording differs between sources mostly because of sponsor names and spelling; summarise rather than list each.
  for (const s of secs) {
    const v = (s.conflicts ?? []).filter(c => c.kind === 'venue');
    if (v.length) conflicts.push(`${s.name}: sources name the venue differently for ${v.length} ${v.length === 1 ? 'game' : 'games'} (sponsor names or spelling). The first source's name is shown. Example: ${v[0].text.replace(/^[^:]*: venue wording differs /, '').replace(/ Used .*$/, '')}`);
  }
  h += conflicts.length ? liEn(conflicts, L) : `<p class="muted">${esc(L.ui('noConflicts'))}</p>`;

  h += `<p class="sub">${esc(L.ui('subPostponements'))}</p>`;
  const pp = all.filter(f => f.status === 'postponed').map(f => L.ui('postponedLine', { section: f.section, label: label(f) }));
  h += li(pp);
  h += liEn(secs.map(s => s.postponementCheck).filter(Boolean), L);

  h += `<p class="sub">${esc(L.ui('subTbc'))}</p>`;
  const tbc = [
    ...all.filter(f => !f.time && f.status !== 'postponed').map(f => L.ui('tbcTime', { section: f.section, label: label(f) })),
    ...all.filter(f => !f.venue).map(f => L.ui('tbcVenue', { section: f.section, label: label(f) })),
  ];
  h += tbc.length ? li(tbc) : `<p class="muted">${esc(L.ui('allKnown'))}</p>`;

  const hidden = (data.hidden ?? []).length ? [L.ui('hiddenNote', { names: data.hidden.map(n => L.comp(n)).join(', ') })] : [];
  const free = [...(data.notes ?? []), ...secs.flatMap(s => (s.notes ?? []).map(n => `${s.name}: ${n}`))];
  h += `<p class="sub">${esc(L.ui('subCaveats'))}</p>${li(hidden)}${liEn(free, L)}`;

  h += `<p class="sub">${esc(L.ui('subSources'))}</p>`;
  const srcs = secs.map(s => {
    const used = (s.sources ?? []).filter(x => x.ok).map(x => `${x.name} ${x.role === 'base' ? L.ui('mainList') : L.ui('crossCheck')}`);
    const bad = (s.sources ?? []).filter(x => !x.ok).map(x => L.ui('failed', { name: x.name, error: x.error }));
    return `${L.comp(s.name)}: ${used.length ? used.join('; ') : L.ui('noSource')}.${bad.length ? ' ' + bad.join('; ') + '.' : ''}`;
  });
  h += li(srcs);

  h += `<p class="sub">${esc(L.ui('subChecked'))}</p><p>${esc(data.checkedAt)} ${esc(L.ui('ukTime'))}</p>\n</div>`;
  return h;
}

/** "Before you travel" is a top-level accordion like the groups, at the bottom, collapsed on load. */
function renderTravel(data, L) {
  return `<details class="group travel">
<summary class="group-h"><h2>${esc(L.ui('travel'))}</h2></summary>
<div class="group-body">
${travelBody(data, L)}
</div>
</details>`;
}

// ---------- page ----------
/** The swap icon: a small globe with the other language's code, linking to the other page. */
function langSwitch(L) {
  const s = L.switchTo;
  return `<a class="lang-switch" href="${esc(s.href)}" hreflang="${esc(s.lang)}" lang="${esc(s.lang)}" title="${esc(s.name)}" aria-label="${esc(s.name)}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><span aria-hidden="true">${esc(s.code)}</span></a>`;
}

/** options.lang: a language from makeLang() (English by default). The Welsh page lives in cy/, so its asset paths start with ../ */
export function renderPage(fullData, options = {}) {
  const L = options.lang ?? makeLang('en');
  // Competitions with no named team involved (or no games) are not rendered, nor mentioned in the travel notes
  // except for one line saying what was left out (data.hidden).
  const data = { ...fullData, sections: fullData.sections.filter(s => !s.hidden) };
  return `<!doctype html>
<html lang="${L.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(L.ui('title'))}</title>
<meta name="color-scheme" content="light dark">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS_HREF}">
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<header class="hd">
<div class="hd-row">
<div class="hd-title">
<p class="kicker">${esc(L.rangeLabel(data.window))}</p>
<h1>${esc(L.ui('title'))}</h1>
</div>
${langSwitch(L)}
</div>
<p class="lede">${esc(L.ui('lede'))}</p>
</header>
<main>
${renderSections(data.sections, data.groupLogos, L)}
${renderTravel(data, L)}
</main>
</div>
</body>
</html>
`;
}
