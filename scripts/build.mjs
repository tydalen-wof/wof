// Collect -> reconcile -> write data/fixtures.json, data/premier-south.json and index.html.
//   node scripts/build.mjs                  (run date = today in Europe/London)
//   BUILD_DATE=2026-11-12 node scripts/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { londonToday, windowFor, londonStamp } from './lib/time.mjs';
import { sleep } from './lib/http.mjs';
import { reconcile } from './lib/reconcile.mjs';
import { sortFixtures, result } from './lib/fixture.mjs';
import { teamKey } from './lib/teams.mjs';
import { renderPage } from './render.mjs';
import * as premierLeague from './collect/premier-league.mjs';
import * as efl from './collect/efl.mjs';
import * as sky from './collect/sky.mjs';
import * as uefa from './collect/uefa.mjs';
import * as espn from './collect/espn.mjs';
import * as southern from './collect/southern-league.mjs';
import * as parkway from './collect/parkway.mjs';
import * as betexplorer from './collect/betexplorer.mjs';
import * as cymru from './collect/cymru-north.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INTL = 'Other UK and European internationals';

// Section order is the page order. `critical` sections fail the build if no source can be read.
const SECTIONS = [
  { key: 'wales', name: "Wales men's internationals", layout: 'plain', followKey: null },
  { key: 'internationals', name: INTL, layout: 'days', followKey: INTL },
  { key: 'premier-league', name: 'Premier League', layout: 'rows', critical: true },
  { key: 'championship', name: 'Championship', layout: 'rows', critical: true },
  { key: 'league-one', name: 'League One', layout: 'rows' },
  { key: 'southern-premier-south', name: 'Southern League Premier South', layout: 'rows' },
  { key: 'cymru-north', name: 'Novira Cymru North', layout: 'rows' },
];

const isWales = f => f.home === 'Wales' || f.away === 'Wales';
function split(res) {
  const part = pred => ({ ...res, fixtures: res.fixtures.filter(pred), teams: [...new Set(res.fixtures.filter(pred).flatMap(f => [f.home, f.away]))] });
  return { wales: part(isWales), other: part(f => !isWales(f)) };
}

function postponementLine(name, results, fixtures) {
  const capable = results.filter(r => r.ok && r.postponements);
  const n = fixtures.filter(f => f.status === 'postponed').length;
  if (!capable.length) {
    return `${name}: postponements could not be checked, because no source that reports them could be read. Check the clubs before travelling.`;
  }
  const names = [...new Set(capable.map(r => r.name))].join(', ');
  return `${name}: postponements checked in ${names}; ${n ? `${n} marked postponed (listed above)` : 'none marked postponed'}.`;
}

function sectionFrom(def, rec, results, config, extraNotes = []) {
  const followed = def.followKey === null ? [] : (config.followed[def.followKey ?? def.name] ?? []);
  const notes = [...rec.notes, ...results.filter(r => r.ok).flatMap(r => r.notes ?? []), ...extraNotes];
  const teams = rec.base?.teams;
  if (teams && followed.length) {
    const keys = new Set(teams.map(teamKey));
    for (const t of followed) {
      // International teams that simply have no game this window are not an error.
      if (def.layout !== 'days' && !keys.has(teamKey(t))) notes.push(`Followed team "${t}" was not found in the ${rec.base.name} team list. Check its spelling in config/teams.json.`);
    }
  }
  const sources = results.map(r => ({
    name: r.name, url: r.url, ok: r.ok, error: r.error,
    role: rec.base === r ? 'base' : 'check',
    matched: rec.checks.find(c => c.name === r.name && c.url === r.url)?.matched ?? null,
  }));
  return {
    key: def.key, name: def.name, layout: def.layout, followed,
    unavailable: !rec.base,
    fixtures: sortFixtures(rec.fixtures), sources, conflicts: rec.conflicts, notes: [...new Set(notes)],
    postponementCheck: postponementLine(def.name, results, rec.fixtures),
  };
}

/** If neither Southern League route works: Parkway's own site for Parkway rows, BetExplorer for the rest. */
function southernFallback(pw, bet) {
  const mine = pw.ok ? pw.fixtures : [];
  const involvesParkway = f => f.home === parkway.CLUB || f.away === parkway.CLUB;
  const rest = bet.ok ? bet.fixtures.filter(f => !involvesParkway(f)) : [];
  if (!mine.length && !rest.length) return null;
  const res = result({ id: 'sfl-fallback', name: 'Parkway website (Parkway games) + BetExplorer (other games)', url: `${parkway.META.url} ; ${betexplorer.META.url}`, postponements: false }, {
    fixtures: [...mine, ...rest], complete: false,
    notes: ['The Southern League feed and page both failed, so this section is built from the Parkway website and BetExplorer. BetExplorer uses short club names, lists only some games and can omit postponed ones.'],
  });
  return res;
}

export async function build({ now = new Date(), write = true, log = console.log } = {}) {
  const config = JSON.parse(readFileSync(join(ROOT, 'config/teams.json'), 'utf8'));
  const today = process.env.BUILD_DATE || londonToday(now);
  const window = windowFor(today);
  const ctx = { today, window, config, now };
  log(`Window ${window.start} to ${window.end} (run date ${today}, UK time)`);

  // One request per source per run. Different hosts run in parallel; Sky's pages and ESPN's pages run one after another.
  const skyPages = (async () => {
    const out = {};
    for (const c of ['Premier League', 'Championship', 'League One', 'Wales']) { out[c] = await sky.collect(c, today); await sleep(1000); }
    return out;
  })();
  const espnPages = (async () => {
    const out = [];
    for (const k of Object.keys(espn.PAGES)) { out.push(await espn.collect(k)); await sleep(1000); }
    return espn.merge(out);
  })();
  const southernRoutes = (async () => {
    const s = await southern.collect(ctx);
    const pw = await parkway.collect();
    const bet = await betexplorer.collect(ctx);
    return { s, pw, bet };
  })();

  const [pl, eflRes, skyRes, uefaRes, espnRes, so, faw] = await Promise.all([
    premierLeague.collect(ctx), efl.collect(ctx), skyPages, uefa.collect(ctx), espnPages, southernRoutes, cymru.collect(ctx),
  ]);

  // Southern League source list and cup ties from Parkway's page.
  const { s: sfl, pw, bet } = so;
  let southernResults, southernNotes = [], via;
  if (sfl.used?.ok) {
    via = sfl.primary.ok ? 'JSON feed' : 'browser scrape';
    const base = sfl.used;
    if (pw.ok && pw.cupTies?.length) {
      const inWin = pw.cupTies.filter(f => f.date >= window.start && f.date <= window.end);
      const known = new Set(base.fixtures.map(f => `${f.date}|${teamKey(f.home)}|${teamKey(f.away)}`));
      const added = inWin.filter(f => !known.has(`${f.date}|${teamKey(f.home)}|${teamKey(f.away)}`));
      base.fixtures.push(...added);
      if (added.length) southernNotes.push(`${added.length} cup tie(s) for ${parkway.CLUB} come only from the Parkway website; the Southern League feed does not list them.`);
    }
    southernResults = [sfl.primary, ...(sfl.scrape ? [sfl.scrape] : []), pw, bet];
  } else {
    via = 'Parkway website + BetExplorer (fallback)';
    const fb = southernFallback(pw, bet);
    southernResults = [sfl.primary, sfl.scrape, ...(fb ? [fb] : [pw, bet])].filter(Boolean);
  }

  const wales = split(uefaRes).wales, intl = split(uefaRes).other;
  const sourcesByKey = {
    wales: [wales, split(espnRes).wales, skyRes.Wales],
    internationals: [intl, split(espnRes).other],
    'premier-league': [pl, skyRes['Premier League']],
    championship: [eflRes.Championship, skyRes.Championship],
    'league-one': [eflRes['League One'], skyRes['League One']],
    'southern-premier-south': southernResults,
    'cymru-north': [faw],
  };

  const sections = [];
  for (const def of SECTIONS) {
    const results = sourcesByKey[def.key];
    const rec = reconcile({ competition: def.name, results, aliases: config.aliases, window });
    if (!rec.base && def.critical) {
      const why = results.map(r => `${r.name}: ${r.error}`).join('; ');
      throw new Error(`${def.name}: no source could be read (${why}). Not publishing an empty section.`);
    }
    const extra = [];
    if (!rec.base) extra.push('No source could be read, so this section is empty because of that, not because there are no games.');
    if (def.key === 'southern-premier-south') extra.push(...southernNotes);
    if (def.key === 'cymru-north') {
      for (const f of rec.fixtures) {
        const g = config.cymruNorthGrounds[f.home];
        if (config.followed[def.name].some(t => teamKey(t) === teamKey(f.home)) && g?.caveat) extra.push(g.caveat);
      }
    }
    sections.push(sectionFrom(def, rec, results, config, extra));
    log(`${def.name}: ${rec.fixtures.length} fixtures, ${rec.conflicts.length} conflicts, base ${rec.base?.name ?? 'none'}`);
  }

  const grounds = Object.fromEntries(Object.entries(config.cymruNorthGrounds).filter(([k]) => !k.startsWith('_')));
  const data = {
    generatedAt: now.toISOString(),
    checkedAt: londonStamp(now),
    window,
    notes: [],
    postcodes: { followedHomes: config.followed['Novira Cymru North'], grounds },
    sections,
    fixtures: sections.flatMap(s => s.fixtures),
  };
  if (write) {
    mkdirSync(join(ROOT, 'data'), { recursive: true });
    writeFileSync(join(ROOT, 'data/fixtures.json'), JSON.stringify(data, null, 2) + '\n');
    const ps = sections.find(s => s.key === 'southern-premier-south');
    southern.writeJson(join(ROOT, 'data/premier-south.json'), { fixtures: ps.fixtures, url: ps.sources.find(x => x.role === 'base')?.url ?? southern.API_META.url, raw: sfl.used?.raw }, via);
    writeFileSync(join(ROOT, 'index.html'), renderPage(data));
    log('Wrote data/fixtures.json, data/premier-south.json and index.html');
  }
  return data;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  build().catch(e => { console.error('BUILD FAILED:', e.message); process.exit(1); });
}
