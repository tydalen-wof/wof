// Merge one competition's collector results into a single fixture list.
//  - The first complete, working source is the base (normally the official feed).
//  - Every other working source is cross-checked fixture by fixture.
//  - Where sources disagree on date, time or home/away, the majority wins; a tie goes to the base.
//  - A game marked postponed by ANY source is marked postponed.
//  - Disagreements are returned as conflicts, so they can be listed in the travel notes.
import { makeResolver, pairKey, sameVenue } from './teams.mjs';
import { shortDate, inWindow } from './time.mjs';

const label = f => `${f.home} v ${f.away}`;
const dayDiff = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);

function vote(entries, baseValue) {
  const counts = new Map();
  for (const e of entries) if (e.value != null) counts.set(e.value, (counts.get(e.value) ?? 0) + 1);
  if (!counts.size) return { value: null, how: 'none' };
  const top = Math.max(...counts.values());
  const leaders = [...counts].filter(([, n]) => n === top).map(([v]) => v);
  const value = leaders.includes(baseValue) ? baseValue : leaders[0];
  return { value, how: leaders.length === 1 ? 'majority' : 'tie, so the base source was used' };
}

// A source "covers" a fixture if it displays that day and (for single-club sources) the fixture involves that club.
const covers = (src, f) => (src.covers == null || src.covers.has(f.date)) && (src.scope ? src.scope(f) : true);

export function reconcile({ competition, results, aliases = {}, window }) {
  const conflicts = [];
  const notes = [];
  const working = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);
  for (const f of failed) notes.push(`${f.name} could not be read (${f.error}). It was not used.`);

  let base = working.find(r => r.complete) ?? null;
  if (!base && working.length) {
    base = [...working].sort((a, b) => b.fixtures.length - a.fixtures.length)[0];
    notes.push(`No complete source was available for ${competition}. ${base.name} was used and may be missing games.`);
  }
  if (!base) return { competition, base: null, fixtures: [], conflicts, notes, checks: [], failed };
  if (base !== results[0]) notes.push(`${results[0].name} was unavailable, so ${base.name} was used as the base list.`);

  const baseFixtures = base.fixtures.filter(f => inWindow(f.date, window));
  const canonical = base.teams?.length ? base.teams : [...new Set(base.fixtures.flatMap(f => [f.home, f.away]))];
  const resolve = makeResolver(canonical, aliases);

  // Index every other working source by team pair.
  const others = working.filter(r => r !== base).map(src => {
    const index = new Map();
    const unmatched = new Set();
    const half = [];                       // fixtures with exactly one unrecognised team name
    for (const f of src.fixtures) {
      if (!inWindow(f.date, window)) continue;
      const home = resolve(f.home), away = resolve(f.away);
      if (!home && !away) continue;        // e.g. two non-European sides in a friendly: irrelevant here
      if ((!home || !away) && src.adds) continue;   // an "adds" source covers clubs the base list may not know
      if (!home || !away) {
        const unknown = home ? f.away : f.home;
        unmatched.add(unknown);
        half.push({ date: f.date, known: home ?? away });
        continue;
      }
      const key = pairKey(home, away);
      if (!index.has(key)) index.set(key, []);
      index.get(key).push({ ...f, home, away });
    }
    // An "adds" source also contributes ties the base list lacks (e.g. a league feed's cup ties for its own clubs).
    const addsList = src.adds
      ? src.fixtures.filter(f => inWindow(f.date, window)).map(f => ({ ...f, home: resolve(f.home) ?? f.home, away: resolve(f.away) ?? f.away }))
      : [];
    return { src, index, unmatched, half, addsList, matched: 0, seen: new Set() };
  });

  const out = [];
  for (const b of baseFixtures) {
    const key = pairKey(b.home, b.away);
    const views = [{ name: base.name, date: b.date, time: b.time, home: b.home, status: b.status, venue: b.venue }];
    for (const o of others) {
      const cands = o.index.get(key);
      if (cands?.length) {
        const c = [...cands].sort((x, y) => dayDiff(x.date, b.date) - dayDiff(y.date, b.date))[0];
        o.matched++;
        o.seen.add(c);
        views.push({ name: o.src.name, date: c.date, time: c.time, home: c.home, status: c.status, venue: c.venue });
      } else if (!o.src.lenient && covers(o.src, b)
                 && !o.half.some(h => dayDiff(h.date, b.date) <= 1 && (h.known === b.home || h.known === b.away))) {
        conflicts.push({ kind: 'missing', competition, text: `${label(b)} on ${shortDate(b.date)} is listed by ${base.name} but not by ${o.src.name}, which does cover that day.` });
      }
    }

    const names = v => v.map(x => x.name).join(', ');
    const pick = (field, entries, baseValue) => {
      const distinct = new Set(entries.filter(e => e.value != null).map(e => e.value));
      const { value: chosen, how } = vote(entries, baseValue);
      if (distinct.size > 1) {
        const detail = entries.filter(e => e.value != null).map(e => `${e.name} ${e.value}`).join(', ');
        conflicts.push({ kind: field, competition, text: `${label(b)}, ${shortDate(b.date)}: ${field} differs (${detail}). Used ${chosen} (${how}).` });
      }
      return chosen;
    };

    const date = pick('date', views.map(v => ({ name: v.name, value: v.date })), b.date);
    const time = pick('kick-off time', views.map(v => ({ name: v.name, value: v.time })), b.time);
    const home = pick('home team', views.map(v => ({ name: v.name, value: v.home })), b.home);
    const away = home === b.home ? b.away : b.home;

    let status = b.status;
    const pp = views.filter(v => v.status === 'postponed');
    if (pp.length) {
      status = 'postponed';
      if (pp.length < views.length) conflicts.push({ kind: 'postponed', competition, text: `${label(b)} on ${shortDate(b.date)} is marked postponed by ${names(pp)} but not by ${names(views.filter(v => v.status !== 'postponed'))}. Shown as postponed.` });
    }

    let venue = home === b.home ? b.venue : null;
    if (!venue) venue = views.find(v => v.venue && v.home === home)?.venue ?? null;
    for (const v of views.slice(1)) {
      if (b.venue && v.venue && home === b.home && !sameVenue(b.venue, v.venue)) {
        conflicts.push({ kind: 'venue', competition, text: `${label(b)}, ${shortDate(b.date)}: venue wording differs (${base.name} "${b.venue}", ${v.name} "${v.venue}"). Used "${b.venue}".` });
      }
    }

    out.push({ ...b, date, time, home, away, venue, status, sources: views.map(v => v.name) });
  }

  // Fixtures another source lists that the base does not.
  for (const o of others) {
    for (const [, list] of o.index) {
      for (const f of list) {
        if (o.seen.has(f) || o.src.lenient || o.src.adds || (o.src.scope && !o.src.scope(f))) continue;
        conflicts.push({ kind: 'extra', competition, text: `${o.src.name} lists ${label(f)} on ${shortDate(f.date)}, but ${base.name} does not. It was not added.` });
      }
    }
  }

  // Ties only an "adds" source lists are added to the section, and said so.
  const baseKeys = new Set(baseFixtures.map(b => pairKey(b.home, b.away)));
  for (const o of others.filter(o => o.src.adds)) {
    const extra = o.addsList.filter(f => !baseKeys.has(pairKey(f.home, f.away)));
    for (const f of extra) { out.push({ ...f, sources: [o.src.name] }); baseKeys.add(pairKey(f.home, f.away)); }
    if (extra.length) notes.push(`${extra.length} tie(s) come only from ${o.src.name}, not from ${base.name}: ${extra.map(label).join('; ')}.`);
  }

  for (const o of others) {
    if (o.unmatched.size) notes.push(`${o.src.name}: a team name was not recognised, so these games could not be cross-checked: ${[...o.unmatched].sort().join(', ')}.`);
  }

  const checks = others.map(o => ({
    name: o.src.name, url: o.src.url, matched: o.matched,
    covers: o.src.covers ? [...o.src.covers].filter(d => inWindow(d, window)).length : null,
  }));
  return { competition, base, fixtures: out, conflicts, notes, checks, failed };
}
