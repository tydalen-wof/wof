# wof (yr wythnos o'flaen)

Weekly football fixtures report. A script collects fixtures from public sources, writes `data/fixtures.json`,
and renders `index.html`, which GitHub Pages serves. A GitHub Action rebuilds it every Thursday.

## Run locally

Needs Node 20 or newer. There are no dependencies to install.

```bash
node scripts/build.mjs                       # builds for today (Europe/London)
BUILD_DATE=2026-11-12 node scripts/build.mjs # builds for another run date
npm test
```

- Output: `index.html` and `data/fixtures.json`.
- Window: run date through the Sunday after next (Thursday to Sunday, 11 days).
- The build fails, and writes nothing, if no source can be read for the Premier League or the Championship.
- Behind an HTTP proxy, Node's `fetch` ignores `HTTPS_PROXY` unless `NODE_USE_ENV_PROXY=1` is also set.

## Publishing

- Pages: Settings > Pages > Deploy from branch > `main` / root.
- `.github/workflows/report.yml` runs Thursdays 05:30 UTC and on demand (Actions > Weekly fixtures report > Run workflow).
- It builds, tests, then commits `index.html` and `data/fixtures.json` if they changed. A failed build or test commits nothing.
- Scheduled runs can be delayed by GitHub during busy periods. The page states its own checked-at time.

## Sources

One request per source per run (the Southern League feed takes two pages plus one for cup ties). No retries.
User agent: `wof-fixtures-bot/1.0`. bbc.co.uk is never used.
The first source listed is the main list. The others are cross-checked against it.

| Section | Sources |
| --- | --- |
| Premier League | Premier League official feed; Sky Sports |
| Championship, League One | EFL official feed (plus its team feed for stadiums); Sky Sports |
| Wales men's, other internationals | UEFA official feed; ESPN (Eastern time, converted); Sky Sports (Wales page, Wales only) |
| Southern League Premier South | Southern League JSON feed; if it fails, Parkway site (Parkway games) plus BetExplorer (other games). Cross-checks: Parkway site (Parkway games), BetExplorer (CET, converted) |
| Novira Cymru North | faw.cymru (team names from match URLs; no venues; no postponement status) |

Not used: ESPN's API host and Football Web Pages (both refuse automated requests); TNT, VAVEL and isthefootballon
(no complete fixture list). ESPN's default schedule pages show only some match days, so they are compared only on
the days they show.

### Southern League feed

The fixtures page (<https://www.southern-football-league.co.uk/fixtures>) is a JavaScript app, so its HTML holds no
fixtures. The build reads the JSON API the page itself loads, in `scripts/collect/southern-league.mjs`:

- `GET https://api.southern-football-league.co.uk/matches` with header `X-TENANT-ID: sfl`, the Premier South competition, the page's own 60-day window, following `pagination.hasNextPage`.
- The feed's `dateTime` has a fake trailing `Z`: it is UK local time. `date` and `time` are used as given, so BST needs no conversion.
- It is undocumented and can change without notice. The build refuses partial data (fewer matches than the API reports), another competition's matches, inconsistent dates and empty lists, then falls back to the Parkway site plus BetExplorer and says so in the notes.
- A browser is not used: the rendered page loads from this same API, so it would fail whenever the API does.

### Rules the build follows

- Where sources disagree on date, time or home/away, the majority wins. A tie keeps the main source's value.
- A game marked postponed (P-P, PP, postponed) in any source is shown as postponed.
- An unreadable source is never treated as "no postponements". The notes say which sections could not be checked.
- Unknown times and venues show `TBC`. Nothing is guessed.
- Conflicts, failed sources, caveats and the checked-at time go in the "Before you travel" accordion.

## Followed teams

Edit `config/teams.json` and rebuild. No code changes.

```json
"followed": {
  "Premier League": ["Leeds United", "Manchester United", "Liverpool"]
}
```

1. Add the name to the right section's list. Order matters: earlier teams are listed first.
2. Use the spelling the main source uses (see `data/fixtures.json`). The build adds a note if a followed team is not found.
3. For Novira Cymru North, also add the ground to `cymruNorthGrounds` (`venue`, `postcode`, optional `caveat`). Postcodes show only on followed clubs' home games. A missing postcode shows "Postcode not found".
4. If a source spells a club differently, add an entry to `aliases`. For a Cymru North club whose name looks wrong, add its faw.cymru URL slug to `cymruNorthSlugNames`.
5. `fallbackGrounds` supplies a ground only when the EFL feed has none. Its use is flagged in the notes.

## Layout

```text
config/teams.json        followed teams, Cymru North grounds, aliases, fallback grounds
scripts/collect/*.mjs    one module per source: returns normalised fixtures, notes and success or failure
scripts/lib/             UK-time helpers (Intl), HTTP helper, team-name matching, reconciliation
scripts/build.mjs        collect, reconcile, write JSON and HTML
scripts/render.mjs       data to HTML
test/                    unit tests and the HTML structure snapshot
```

Fixture shape: `{ date, time|null, home, away, venue|null, competition, tag|null, status, sources[] }`.

## Tests

`npm test` covers GMT/BST, CET and US Eastern conversions across changeover dates, each source parser, the
majority/tie/postponement logic, the Southern League feed checks, and the page structure (nothing open, no `h3`, section order,
postcodes only on followed Cymru North home games). If the page structure changes on purpose, review the diff and run
`UPDATE_SNAPSHOT=1 npm test`.
