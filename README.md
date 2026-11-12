# wof (yr wythnos o'flaen)

Weekly football fixtures report. A script collects fixtures from public sources, writes `data/fixtures.json`,
and renders `index.html`, which GitHub Pages serves. A GitHub Action rebuilds it every Thursday.

## Run locally

Needs Node 20 or newer. There are no dependencies to install.

```bash
node scripts/build.mjs                       # builds for today (Europe/London)
BUILD_DATE=2026-11-12 node scripts/build.mjs # builds for another run date
npm test
node scripts/scrape.mjs                      # only refreshes data/premier-south.json
```

- Output: `index.html`, `data/fixtures.json`, `data/premier-south.json`.
- Window: run date through the Sunday after next (Thursday to Sunday, 11 days).
- The build fails, and writes nothing, if no source can be read for the Premier League or the Championship.
- Behind an HTTP proxy, Node's `fetch` ignores `HTTPS_PROXY` unless `NODE_USE_ENV_PROXY=1` is also set.

## Publishing

- Pages: Settings > Pages > Deploy from branch > `main` / root.
- `.github/workflows/report.yml` runs Thursdays 05:30 UTC and on demand (Actions > Weekly fixtures report > Run workflow).
- It builds, tests, then commits `index.html` and `data/` if they changed. A failed build or test commits nothing.
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

### Rules the build follows

- Where sources disagree on date, time or home/away, the majority wins. A tie keeps the main source's value.
- A game marked postponed (P-P, PP, postponed) in any source is shown as postponed.
- An unreadable source is never treated as "no postponements". The notes say which sections could not be checked.
- Unknown times and venues show `TBC`. Nothing is guessed.
- Conflicts, failed sources, caveats and the checked-at time go in the "Before you travel" accordion.

## Southern League data file

`data/premier-south.json` is served at <https://gdoutch.github.io/wof/data/premier-south.json> and keeps its original format.

The fixtures page (<https://www.southern-football-league.co.uk/fixtures>) is a JavaScript app, so its HTML holds no
fixtures. It loads them from its own JSON API, which `scripts/scrape.mjs` reads:

- `GET https://api.southern-football-league.co.uk/matches`
  - header `X-TENANT-ID: sfl` (the tenant id from the page's own config)
  - `competition=69d0bd99b616bafb97331d3f` (Premier South)
  - `period=Days&periodLimit=60`: the page's own relative window, from today
  - `status=fixture&sort=asc&limit=100&page=N`, following `pagination.hasNextPage`

The endpoint is undocumented and can change without notice. The scraper fails loudly if it does.
A browser (Playwright) is not used: the rendered page loads from this same API, so it would fail whenever the API does.

| Field | Meaning |
| --- | --- |
| `source` | The public fixtures page |
| `api` | The API endpoint used |
| `fetchedAt` | UTC time of the run (ISO 8601) |
| `division` | `PREMIER SOUTH` |
| `windowDays` | Days ahead of the run that the list covers (60) |
| `count` | Number of fixtures in `fixtures` |
| `postponed` | Number of fixtures with `status: "postponed"` |
| `fixtures[]` | One entry per fixture, in date then kick-off order |
| `fixtures[].date` | Kick-off date, `YYYY-MM-DD` (UK local date) |
| `fixtures[].home` / `away` | Team names, trimmed and with single spaces |
| `fixtures[].status` | Kick-off time as `HH:MM` (UK local), or `"postponed"` |
| `rawSection` | The raw API rows, untrimmed, for checking by eye |

- A postponed fixture keeps its place with `status: "postponed"` (shown as "P-P" on the site). It has no rescheduled date.
- The API's `dateTime` carries the UK local date (its trailing `Z` is not a true UTC instant), and `time` is the local kick-off. Both are used as given, so BST needs no conversion.
- Nothing is written, and the build uses its fallback, if any of these happen: an HTTP error, a match from another competition, an unknown status, fewer matches than the API reports, or zero fixtures.
- The file is written atomically. If the feed fails, the existing file is left unchanged.

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
scripts/scrape.mjs       Southern League feed reader and data-file writer (also runnable alone)
test/                    unit tests and the HTML structure snapshot
```

Fixture shape: `{ date, time|null, home, away, venue|null, competition, tag|null, status, sources[] }`.

## Tests

`npm test` covers GMT/BST, CET and US Eastern conversions across changeover dates, each source parser, the
majority/tie/postponement logic, the data-file rules, and the page structure (nothing open, no `h3`, section order,
postcodes only on followed Cymru North home games). If the page structure changes on purpose, review the diff and run
`UPDATE_SNAPSHOT=1 npm test`.
