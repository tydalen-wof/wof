// Pure function: report data -> one self-contained HTML page (no <details> is ever rendered open).
import { shortDate, longDate, rangeLabel } from './lib/time.mjs';
import { teamKey } from './lib/teams.mjs';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

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
h2{margin:0;font:700 1.7rem/1.05 "Barlow Condensed","Arial Narrow","Helvetica Neue",Arial,sans-serif;letter-spacing:.02em;text-transform:uppercase}
.comp{margin:12px 0;background:var(--surface);border:1px solid var(--line);border-radius:4px}
.comp-empty{margin:12px 0;padding:14px 16px;border:1px solid var(--line);border-radius:4px;background:var(--surface)}
summary{cursor:pointer;list-style:none}
summary::-webkit-details-marker{display:none}
summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.comp-h{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px}
.comp-h::after,.rest-line::after{content:"+";flex:none;width:1.4rem;height:1.4rem;line-height:1.3rem;text-align:center;border:1px solid var(--line);border-radius:3px;color:var(--accent);font:600 1.1rem/1.3rem "IBM Plex Sans",Arial,sans-serif}
details[open]>.comp-h::after,details[open]>summary .rest-line::after{content:"\\2212"}
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
.notes-body{padding:6px 16px 16px}
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
const tag = (text, cls = '') => `<span class="tag${cls ? ' ' + cls : ''}">${esc(text)}</span>`;

function postcodeFor(f, ctx) {
  if (!ctx.postcodes) return '';
  const { followedHomes, grounds } = ctx.postcodes;
  if (!followedHomes.has(teamKey(f.home))) return '';
  const g = grounds[f.home];
  return `<span class="pc">${esc(g?.postcode ?? 'Postcode not found')}</span>`;
}

function row(f, ctx) {
  const pp = f.status === 'postponed';
  const time = f.time ?? 'TBC';
  const tags = [f.tag ? tag(f.tag) : '', pp ? tag('Postponed', 'tag-pp') : ''].join('');
  return `<div class="row">
<div class="when"><span class="d">${esc(shortDate(f.date))}</span><span class="t">${pp ? `<s>${esc(time)}</s>` : esc(time)}</span></div>
<div class="match"><span class="team">${esc(f.home)}</span><span class="v">v</span><span class="team">${esc(f.away)}</span>${tags ? `<span class="tags">${tags}</span>` : ''}</div>
<div class="venue"><span class="ven">${esc(f.venue ?? 'TBC')}</span>${postcodeFor(f, ctx)}</div>
</div>`;
}

function rowsWithDays(list, ctx) {
  let out = '', last = null;
  for (const f of list) {
    if (f.date !== last) { out += `<p class="day">${esc(longDate(f.date))}</p>\n`; last = f.date; }
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

// ---------- sections ----------
function plainHeading(name, unavailable = false) {
  const why = unavailable ? '<p class="muted unavailable">Could not be read. See Before you travel.</p>' : '';
  return `<section class="comp-empty"><h2>${esc(name)}</h2>${why}</section>`;
}

function accordion(name, body, extraClass = '') {
  return `<details class="comp${extraClass ? ' ' + extraClass : ''}">
<summary class="comp-h"><h2>${esc(name)}</h2></summary>
<div class="comp-body">
${body}</div>
</details>`;
}

function nested(mine, rest, restLabel, renderList, ctx) {
  if (!rest.length) return renderList(mine, ctx);
  const line = `<div class="rest-line"><span>${esc(restLabel)}</span><span class="count">${esc(plural(rest.length, 'match', 'matches'))}</span></div>`;
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

function renderSection(s, ctx) {
  const fixtures = s.fixtures ?? [];
  if (!fixtures.length) return plainHeading(s.name, s.unavailable);
  const c = { ...ctx, postcodes: s.key === 'cymru-north' ? ctx.postcodes : null };
  if (s.layout === 'plain') return accordion(s.name, plainList([...fixtures].sort(byWhen), c));
  const { mine, rest } = partition(fixtures, s.followed ?? [], { chronological: s.layout === 'days' });
  if (s.layout === 'days') return accordion(s.name, nested(mine, rest, 'Rest of Europe', rowsWithDays, c));
  return accordion(s.name, nested(mine, rest, 'Rest of the division', plainList, c));
}

// ---------- travel notes ----------
function li(items) {
  return items.length ? `<ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : '';
}

function travelBody(data) {
  const secs = data.sections;
  const all = secs.flatMap(s => (s.fixtures ?? []).map(f => ({ ...f, section: s.name })));
  const label = f => `${f.home} v ${f.away}, ${shortDate(f.date)}`;
  let h = '<div class="notes-body">\n';

  h += `<p class="sub">Source conflicts</p>`;
  const conflicts = secs.flatMap(s => (s.conflicts ?? []).filter(c => c.kind !== 'venue').map(c => `${s.name}: ${c.text}`));
  // Venue wording differs between sources mostly because of sponsor names and spelling; summarise rather than list each.
  for (const s of secs) {
    const v = (s.conflicts ?? []).filter(c => c.kind === 'venue');
    if (v.length) conflicts.push(`${s.name}: sources name the venue differently for ${plural(v.length, 'game', 'games')} (sponsor names or spelling). The first source's name is shown. Example: ${v[0].text.replace(/^[^:]*: venue wording differs /, '').replace(/ Used .*$/, '')}`);
  }
  h += conflicts.length ? li(conflicts) : '<p class="muted">No disagreements were found between the sources that could be read.</p>';

  h += `<p class="sub">Postponements</p>`;
  const pp = all.filter(f => f.status === 'postponed').map(f => `${f.section}: ${label(f)} is marked postponed. Do not travel until it is rearranged.`);
  h += li(pp);
  h += li(secs.map(s => s.postponementCheck).filter(Boolean));

  h += `<p class="sub">To be confirmed</p>`;
  const tbc = [
    ...all.filter(f => !f.time && f.status !== 'postponed').map(f => `${f.section}: kick-off time TBC for ${label(f)}.`),
    ...all.filter(f => !f.venue).map(f => `${f.section}: venue TBC for ${label(f)}.`),
  ];
  h += tbc.length ? li(tbc) : '<p class="muted">Every game shown has a kick-off time and a venue.</p>';

  const caveats = [...(data.notes ?? []), ...secs.flatMap(s => (s.notes ?? []).map(n => `${s.name}: ${n}`))];
  h += `<p class="sub">Caveats</p>${li(caveats)}`;

  h += `<p class="sub">Sources</p>`;
  const srcs = secs.map(s => {
    const used = (s.sources ?? []).filter(x => x.ok).map(x => `${x.name}${x.role === 'base' ? ' (main list)' : ' (cross-check)'}`);
    const bad = (s.sources ?? []).filter(x => !x.ok).map(x => `${x.name} failed: ${x.error}`);
    return `${s.name}: ${used.length ? used.join('; ') : 'no source could be read'}.${bad.length ? ' ' + bad.join('; ') + '.' : ''}`;
  });
  h += li(srcs);

  h += `<p class="sub">Checked at</p><p>${esc(data.checkedAt)} (UK time)</p>\n</div>`;
  return h;
}

export function renderPage(data) {
  const ctx = {
    postcodes: data.postcodes ? { followedHomes: new Set(data.postcodes.followedHomes.map(teamKey)), grounds: data.postcodes.grounds } : null,
  };
  const sections = data.sections.map(s => renderSection(s, ctx)).join('\n');
  const travel = accordion('Before you travel', travelBody(data), 'travel').replace('<div class="comp-body">\n', '<div class="comp-body">\n');
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Week Ahead Fixtures</title>
<meta name="color-scheme" content="light dark">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS_HREF}">
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<header class="hd">
<p class="kicker">${esc(rangeLabel(data.window))}</p>
<h1>Week Ahead Fixtures</h1>
<p class="lede">All kick-off times are UK time. Venues are the home club's ground.</p>
</header>
<main>
${sections}
${travel}
</main>
</div>
</body>
</html>
`;
}
