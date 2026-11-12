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
  return base.filter(t => !(DROP.has(t) && base.length > 1)).join(' ');
}

/**
 * Build a resolver from a list of canonical names. resolve(name) returns the canonical name or null.
 * Order: exact key, alias table (works in both directions), then a unique prefix match
 * (so "Evesham" finds "Evesham United").
 */
export function makeResolver(canonicalNames, aliases = {}) {
  const byKey = new Map();
  for (const n of canonicalNames) byKey.set(teamKey(n), n);

  // Union the keys of every alias pair into one equivalence class.
  const parent = new Map();
  const find = k => { while (parent.has(k) && parent.get(k) !== k) k = parent.get(k); return k; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); if (!parent.has(rb)) parent.set(rb, rb); };
  for (const [a, b] of Object.entries(aliases)) if (!a.startsWith('_')) union(teamKey(a), teamKey(b));
  const classOf = k => {
    const root = find(k);
    return [...parent.keys()].filter(x => find(x) === root);
  };

  const cache = new Map();
  return function resolve(name) {
    if (name == null || name === '') return null;
    if (cache.has(name)) return cache.get(name);
    const k = teamKey(name);
    let out = byKey.get(k) ?? null;
    if (!out && parent.has(k)) {
      for (const other of classOf(k)) { if (byKey.has(other)) { out = byKey.get(other); break; } }
    }
    if (!out && k.length >= 4) {
      const hits = [...byKey.entries()].filter(([ck]) => ck.startsWith(k));
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
  const strip = s => teamKey(s).replace(/\b(stadium|stadion|stadio|ground|park|arena)\b/g, '').replace(/\s+/g, ' ').trim();
  const x = strip(a), y = strip(b);
  return !x || !y || x === y || x.includes(y) || y.includes(x);
}
