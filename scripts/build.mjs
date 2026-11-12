// Collect -> reconcile -> write data/fixtures.json and index.html.
//   node scripts/build.mjs                  (run date = today in Europe/London)
//   BUILD_DATE=2026-11-12 node scripts/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { londonToday, windowFor, londonStamp } from './lib/time.mjs';
import { sleep } from './lib/http.mjs';
import { reconcile } from './lib/reconcile.mjs';
import { sortFixtures } from './lib/fixture.mjs';
import { teamKey } from './lib/teams.mjs';
import { renderPage } from './render.mjs';
import * as premierLeague from './collect/premier-league.mjs';
import * as efl from './collect/efl.mjs';
import * as sky from './collect/sky.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Section order is the page order. `critical` sections fail the build if no source can be read.
const SECTIONS = [
  { key: 'premier-league', name: 'Premier League', layout: 'rows', critical: true },
  { key: 'championship', name: 'Championship', layout: 'rows', critical: true },
  { key: 'league-one', name: 'League One', layout: 'rows' },
];

function postponementLine(name, results, fixtures) {
  const capable = results.filter(r => r.ok && r.postponements);
  const n = fixtures.filter(f => f.status === 'postponed').length;
  if (!capable.length) {
    return `${name}: postponements could not be checked, because no source that reports them could be read. Check the clubs before travelling.`;
  }
  const names = [...new Set(capable.map(r => r.name))].join(', ');
  return `${name}: postponements checked in ${names}; ${n ? `${n} marked postponed (listed above)` : 'none marked postponed'}.`;
}

function sectionFrom(def, rec, results, config) {
  const followed = config.followed[def.name] ?? [];
  const notes = [...rec.notes, ...results.filter(r => r.ok).flatMap(r => r.notes ?? [])];
  const teams = rec.base?.teams;
  if (teams) {
    const keys = new Set(teams.map(teamKey));
    for (const t of followed) {
      if (!keys.has(teamKey(t))) notes.push(`Followed team "${t}" was not found in the ${rec.base.name} team list. Check its spelling in config/teams.json.`);
    }
  }
  const sources = results.map(r => ({
    name: r.name, url: r.url, ok: r.ok, error: r.error,
    role: rec.base === r ? 'base' : 'check',
    matched: rec.checks.find(c => c.name === r.name && c.url === r.url)?.matched ?? null,
  }));
  return {
    key: def.key, name: def.name, layout: def.layout, followed,
    fixtures: sortFixtures(rec.fixtures), sources, conflicts: rec.conflicts, notes: [...new Set(notes)],
    postponementCheck: postponementLine(def.name, results, rec.fixtures),
  };
}

export async function build({ now = new Date(), write = true, log = console.log } = {}) {
  const config = JSON.parse(readFileSync(join(ROOT, 'config/teams.json'), 'utf8'));
  const today = process.env.BUILD_DATE || londonToday(now);
  const window = windowFor(today);
  const ctx = { today, window, config, now };
  log(`Window ${window.start} to ${window.end} (run date ${today}, UK time)`);

  // One request per source per run. Different hosts run in parallel; Sky's three pages run one after another.
  const skyPages = (async () => {
    const out = {};
    for (const c of ['Premier League', 'Championship', 'League One']) { out[c] = await sky.collect(c, today); await sleep(1000); }
    return out;
  })();
  const [pl, eflRes, skyRes] = await Promise.all([premierLeague.collect(ctx), efl.collect(ctx), skyPages]);

  const sourcesByKey = {
    'premier-league': [pl, skyRes['Premier League']],
    championship: [eflRes.Championship, skyRes.Championship],
    'league-one': [eflRes['League One'], skyRes['League One']],
  };

  const sections = [];
  for (const def of SECTIONS) {
    const results = sourcesByKey[def.key];
    const rec = reconcile({ competition: def.name, results, aliases: config.aliases, window });
    if (!rec.base && def.critical) {
      const why = results.map(r => `${r.name}: ${r.error}`).join('; ');
      throw new Error(`${def.name}: no source could be read (${why}). Not publishing an empty section.`);
    }
    sections.push(sectionFrom(def, rec, results, config));
    log(`${def.name}: ${rec.fixtures.length} fixtures, ${rec.conflicts.length} conflicts, base ${rec.base?.name ?? 'none'}`);
  }

  const data = {
    generatedAt: now.toISOString(),
    checkedAt: londonStamp(now),
    window,
    notes: [],
    postcodes: null,
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
