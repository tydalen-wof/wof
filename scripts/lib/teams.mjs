// Team-name matching across sources. Sources spell clubs differently ("Man Utd", "Sholing FC", "Havant & W").
const DROP = new Set(['fc', 'afc', 'cf', 'cpd', 'football', 'club']);

export function teamKey(name) {
  const base = String(name ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/).filter(Boolean);
  const kept = base.filter((t, i) => !(DROP.has(t) && base.length > 1));
  return kept.join(' ');
}

/**
 * Build a resolver from a list of canonical names. resolve(name) returns the canonical name or null.
 * Order: exact key, alias table, then a unique prefix match (so "Evesham" finds "Evesham United").
 */
export function makeResolver(canonicalNames, aliases = {}) {
  const byKey = new Map();
  for (const n of canonicalNames) byKey.set(teamKey(n), n);
  const aliasKeys = new Map(Object.entries(aliases).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [teamKey(k), v]));
  const cache = new Map();
  return function resolve(name) {
    if (name == null || name === '') return null;
    if (cache.has(name)) return cache.get(name);
    const k = teamKey(name);
    let out = byKey.get(k) ?? null;
    if (!out && aliasKeys.has(k)) {
      const target = aliasKeys.get(k);
      out = byKey.get(teamKey(target)) ?? null;
    }
    if (!out && k.length >= 4) {
      const hits = [...byKey.entries()].filter(([ck]) => ck.startsWith(k + ' ') || ck.startsWith(k));
      if (hits.length === 1) out = hits[0][1];
    }
    cache.set(name, out);
    return out;
  };
}

export const pairKey = (a, b) => [teamKey(a), teamKey(b)].sort().join('|');

/** Venue names differ in punctuation and sponsor wording; treat containment as agreement. */
export function sameVenue(a, b) {
  if (!a || !b) return true;
  const x = teamKey(a).replace(/ stadium| ground| park/g, ''), y = teamKey(b).replace(/ stadium| ground| park/g, '');
  return x === y || x.includes(y) || y.includes(x);
}
