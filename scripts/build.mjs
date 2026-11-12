// Collect -> reconcile -> write data/fixtures.json and index.html.
//   node scripts/build.mjs                  (run date = today in Europe/London)
//   BUILD_DATE=2026-11-12 node scripts/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { londonToday, windowFor, londonStamp } from './lib/time.mjs';
import { sleep } from './lib/http.mjs';
import { reconcile } from './lib/reconcile.mjs';
import { sortFixtures, result } from './lib/fixture.mjs';
import { teamKey, makeResolver } from './lib/teams.mjs';
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
import * as fa from './collect/fa.mjs';
import * as welshCup from './collect/welsh-cup.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INTL = 'Other UK and European internationals';

// Section order is the page order. `critical` sections fail the build if no source can be read.
// `cup` sections skip the "followed team not in the team list" check (a round holds only some clubs).
// `showPostcodes` sections show a followed Cymru North club's postcode on its home games.
const SECTIONS = [
  { key: 'wales', name: "Wales men's internationals", layout: 'plain', followKey: null },
  { key: 'internationals', name: INTL, layout: 'days', followKey: INTL },
  { key: 'premier-league', name: 'Premier League', layout: 'rows', critical: true },
  { key: 'championship', name: 'Championship', layout: 'rows', critical: true },
  { key: 'league-one', name: 'League One', layout: 'rows' },
  { key: 'southern-premier-south', name: 'Southern League Premier South', layout: 'rows' },
  { key: 'cymru-north', name: 'Novira Cymru North', layout: 'rows', showPostcodes: true },
  { key: 'fa-cup', name: 'FA Cup', layout: 'rows', cup: true },
  { key: 'fa-trophy', name: 'FA Trophy', layout: 'rows', cup: true },
  { key: 'welsh-cup', name: 'FAW Welsh Cup', layout: 'rows', cup: true, showPostcodes: true },
];

const isWales = f => f.home === 'Wales' || f.away === 'Wales';
function split(res) {
  const part = pred => ({ ...res, fixtures: res.fixtures.filter(pred), teams: [...new Set(res.fixtures.filter(pred).flatMap(f => [f.home, f.away]))] });
  return { wales: part(isWales), other: part(f => !isWales(f)) };
}

/** Parkway's page also lists its cup ties; present the ones matching `re` as a cross-check source. */
function parkwayCups(pw, re) {
  if (!pw.ok) return pw;
  return { ...pw, fixtures: (pw.cupTies ?? []).filter(f => re.test(f.tag ?? '')), complete: false };
}

function postponementLine(name, results, fixtures) {
  const capable = results.filter(r => r.ok && r.postponements);
  const full = capable.filter(r => !r.partialNote);
  const n = fixtures.filter(f => f.status === 'postponed').length;
  const found = n ? `${n} marked postponed (listed above)` : 'none marked postponed';
  if (!capable.length) {
    return `${name}: postponements could not be checked: none of the sources for this section report them, or none could be read. Check the clubs before travelling.`;
  }
  const list = rs => [...new Set(rs.map(r => (r.partialNote ? `${r.name} (${r.partialNote})` : r.name)))].join(', ');
  if (!full.length) {
    return `${name}: postponements could only be checked for part of this section (${list(capable)}); ${found}. Other ties could not be checked, so check the clubs before travelling.`;
  }
  return `${name}: postponements checked in ${list(capable)}; ${found}.`;
}

function sectionFrom(def, rec, results, config, extraNotes = []) {
  const followed = def.followKey === null ? [] : (config.followed[def.followKey ?? def.name] ?? []);
  const notes = [...rec.notes, ...results.filter(r => r.ok).flatMap(r => r.notes ?? []), ...extraNotes];
  const teams = rec.base?.teams;
  if (teams && followed.length && !def.cup && def.layout !== 'days') {   // international teams without a game are not an error
    const keys = new Set(teams.map(teamKey));
    for (const t of followed) {
      if (!keys.has(teamKey(t))) notes.push(`Followed team "${t}" was not found in the ${rec.base.name} team list. Check its spelling in config/teams.json.`);
    }
  }
  // Show followed clubs under the spelling used in config/teams.json (e.g. "Milton Keynes Dons" -> "MK Dons").
  const canon = makeResolver(followed, config.aliases, { prefix: false });
  const fixtures = rec.fixtures.map(f => ({ ...f, home: canon(f.home) ?? f.home, away: canon(f.away) ?? f.away }));
  const sources = results.map(r => ({
    name: r.name, url: r.url, ok: r.ok, error: r.error,
    role: rec.base === r ? 'base' : 'check',
    matched: rec.checks.find(c => c.name === r.name && c.url === r.url)?.matched ?? null,
  }));
  return {
    key: def.key, name: def.name, layout: def.layout, followed, showPostcodes: !!def.showPostcodes,
    ...(def.cup ? { restLabel: 'Rest of the round' } : {}),
    unavailable: !rec.base,
    fixtures: sortFixtures(fixtures), sources, conflicts: rec.conflicts, notes: [...new Set(notes)],
    postponementCheck: postponementLine(def.name, results, fixtures),
  };
}

/** If the Southern League feed fails: Parkway's own site for Parkway rows, BetExplorer for the rest. */
function southernFallback(pw, bet) {
  const mine = pw.ok ? pw.fixtures : [];
  const involvesParkway = f => f.home === parkway.CLUB || f.away === parkway.CLUB;
  const rest = bet.ok ? bet.fixtures.filter(f => !involvesParkway(f)) : [];
  if (!mine.length && !rest.length) return null;
  return result({ id: 'sfl-fallback', name: 'Parkway website (Parkway games) + BetExplorer (other games)', url: `${parkway.META.url} ; ${betexplorer.META.url}`, postponements: false }, {
    fixtures: [...mine, ...rest], complete: false,
    notes: ['The Southern League feed failed, so this section is built from the Parkway website and BetExplorer. BetExplorer uses short club names, lists only some games and can omit postponed ones.'],
  });
}

export async function build({ now = new Date(), write = true, log = console.log } = {}) {
  const config = JSON.parse(readFileSync(join(ROOT, 'config/teams.json'), 'utf8'));
  const today = process.env.BUILD_DATE || londonToday(now);
  const window = windowFor(today);
  const ctx = { today, window, config, now };
  log(`Window ${window.start} to ${window.end} (run date ${today}, UK time)`);

  // One request per source page per run. Different hosts run in parallel; pages on the same host run one after another.
  const skyPages = (async () => {
    const out = {};
    for (const c of ['Premier League', 'Championship', 'League One', 'Wales', 'FA Cup']) { out[c] = await sky.collect(c, today); await sleep(1000); }
    return out;
  })();
  const espnPages = (async () => {
    const intl = [];
    for (const k of espn.INTL_PAGES) { intl.push(await espn.collect(k)); await sleep(1000); }
    return { intl: espn.merge(intl), faCup: await espn.collect('eng.fa') };
  })();
  const faPages = (async () => {
    const trophy = await fa.collect('FA Trophy'); await sleep(1000);
    return { trophy, cup: await fa.collect('FA Cup') };
  })();
  const southernRoutes = (async () => {
    const s = await southern.collect(ctx);
    const pw = await parkway.collect();
    const bet = await betexplorer.collect(ctx);
    return { s, pw, bet };
  })();

  const [pl, eflRes, skyRes, uefaRes, espnRes, so, faw, faRes, welsh] = await Promise.all([
    premierLeague.collect(ctx), efl.collect(ctx), skyPages, uefa.collect(ctx), espnPages, southernRoutes, cymru.collect(ctx), faPages, welshCup.collect(ctx),
  ]);

  const { s: sfl, pw, bet } = so;
  const southernResults = sfl.league.ok
    ? [sfl.league, pw, bet]
    : [sfl.league, ...((fb) => (fb ? [fb] : [pw, bet]))(southernFallback(pw, bet))];

  const wales = split(uefaRes).wales, intl = split(uefaRes).other;
  const sourcesByKey = {
    wales: [wales, split(espnRes.intl).wales, skyRes.Wales],
    internationals: [intl, split(espnRes.intl).other],
    'premier-league': [pl, skyRes['Premier League']],
    championship: [eflRes.Championship, skyRes.Championship],
    'league-one': [eflRes['League One'], skyRes['League One']],
    'southern-premier-south': southernResults,
    'cymru-north': [faw],
    'fa-cup': [faRes.cup, skyRes['FA Cup'], espnRes.faCup, parkwayCups(pw, /fa cup/i)],
    'fa-trophy': [faRes.trophy, sfl.trophy, parkwayCups(pw, /fa trophy/i)],
    'welsh-cup': [welsh],
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
    if (def.showPostcodes) {
      const followedHomes = (config.followed[def.name] ?? []).map(teamKey);
      for (const f of rec.fixtures) {
        const g = config.cymruNorthGrounds[f.home];
        if (followedHomes.includes(teamKey(f.home)) && g?.caveat) extra.push(g.caveat);
      }
    }
    sections.push(sectionFrom(def, rec, results, config, extra));
    log(`${def.name}: ${rec.fixtures.length} fixtures, ${rec.conflicts.length} conflicts, base ${rec.base?.name ?? 'none'}`);
  }

  const grounds = Object.fromEntries(Object.entries(config.cymruNorthGrounds).filter(([k]) => !k.startsWith('_')));
  const followedCymru = [...new Set(SECTIONS.filter(d => d.showPostcodes).flatMap(d => config.followed[d.name] ?? []))];
  const data = {
    generatedAt: now.toISOString(),
    checkedAt: londonStamp(now),
    window,
    notes: [],
    postcodes: { followedHomes: followedCymru, grounds },
    sections,
    fixtures: sections.flatMap(s => s.fixtures),
  };
  if (write) {
    mkdirSync(join(ROOT, 'data'), { recursive: true });
    writeFileSync(join(ROOT, 'data/fixtures.json'), JSON.stringify(data, null, 2) + '\n');
    writeFileSync(join(ROOT, 'index.html'), renderPage(data));
    log('Wrote data/fixtures.json and index.html');
  }
  return data;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  build().catch(e => { console.error('BUILD FAILED:', e.message); process.exit(1); });
}
