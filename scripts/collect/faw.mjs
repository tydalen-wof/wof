// Shared reader for faw.cymru match listings (Cymru North and the Welsh Cup use the same platform).
// The page fills in team names with JavaScript (one extra API call per match), so names are taken from each match's
// URL slug instead; the kick-off is the exact UTC timestamp on the card. The pages list no venues and no postponement
// status without those per-match calls, so postponements cannot be checked from them.

// Built-in overrides for slugs whose plain title-cased form is not how the club is written on the FAW site.
// More can be added in config/teams.json under fawSlugNames.
const SLUG_NAMES = {
  'cpd-y-rhyl-1879-fc': 'Rhyl 1879',
  'clwb-pel-droed-dinas-bangor-city-1876-football-club': 'Bangor City 1876',
  'airbus-uk-broughton-fc': 'Airbus UK Broughton',
  'blaen-y-maes-fc': 'Blaen-y-Maes',
  'connahs-quay-nomads-fc': "Connah's Quay Nomads",
  'cpd-y-felinheli': 'Felinheli',
  'dolgellau-aa-fc': 'Dolgellau AA',
  'fc-cwmaman': 'FC Cwmaman',
  'trefelin-bgc': 'Trefelin',
};

export function slugToName(slug, extra = {}) {
  if (extra[slug]) return extra[slug];
  if (SLUG_NAMES[slug]) return SLUG_NAMES[slug];
  return slug.replace(/^cpd-/, '').replace(/-(afc|fc)$/, '').split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Cards on a FAW listing page. `suffix` is the part of the match URL slug after the two team names,
 * e.g. "novira-cymru-north" or "faw-welsh-cup". Cards without a match link (page templates) are ignored.
 */
export function parseFaw(html, suffix = 'novira-cymru-north', slugNames = {}) {
  const starts = [...html.matchAll(/data-match-id="(\d+)"\s+data-match-kickoff-utc="(\d+)"/g)];
  const out = [];
  const re = new RegExp(`^(.*)-vs-(.*?)-${suffix}`);
  starts.forEach((m, i) => {
    const chunk = html.slice(m.index, starts[i + 1]?.index ?? html.length);
    const slug = /\/match\/([^/"]+)\//.exec(chunk)?.[1];
    const t = slug && re.exec(slug);
    if (!t) return;
    out.push({ id: m[1], ms: +m[2], home: slugToName(t[1], slugNames), away: slugToName(t[2], slugNames) });
  });
  return out;
}
