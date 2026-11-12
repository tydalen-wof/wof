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

One request per source page per run (the Southern League feed takes two pages plus one for FA Trophy ties; the FA, Sky and ESPN have one page per competition). No retries.
User agent: `wof-fixtures-bot/1.0`. bbc.co.uk is never used.
The first source listed is the main list. The others are cross-checked against it.

| Section | Sources |
| --- | --- |
| Premier League | Premier League official feed; Sky Sports |
| Championship, League One | EFL official feed (plus its team feed for stadiums); Sky Sports |
| Wales men's, other internationals | UEFA official feed; ESPN (Eastern time, converted); Sky Sports (Wales page, Wales only) |
| Southern League Premier South | Southern League JSON feed; if it fails, Parkway site (Parkway games) plus BetExplorer (other games). Cross-checks: Parkway site (Parkway games), BetExplorer (CET, converted) |
| Novira Cymru North | faw.cymru (team names from match URLs; no venues; no postponement status) |
| FA Cup | The FA's fixtures page (next round only); cross-checks: Sky Sports, ESPN, Parkway site (Parkway ties) |
| FA Trophy | The FA's fixtures page (next round only), plus the Southern League feed, which adds ties for its own clubs and supplies their venues and postponements; cross-check: Parkway site |
| FAW Welsh Cup | faw.cymru (same reader as Cymru North) |

Not used: ESPN's API host and Football Web Pages (both refuse automated requests); TNT, VAVEL and isthefootballon
(no complete fixture list); Sky (it has no FA Trophy page).
ESPN's default schedule pages show only some match days, so they are compared only on the days they show.

### Cup sections

- The FA's pages list only the **next round**, with no venues and no postponement status. A tie from a later round does not appear until that round is next.
- **FA Trophy:** the FA page and the Southern League feed list different ties, so neither is a complete list. Ties only the Southern League feed lists are added and named in the notes. Check thefa.com for the rest.
- **FA Cup:** nothing is shown (a bare heading) when no tie falls in the window.
- **FAW Welsh Cup:** the page lists every tie drawn so far whatever `?currentDate=` says, so the plain address is used. Venues are TBC except for followed Cymru North clubs' home ties, which show their ground and postcode.
- Other cups (Southern League cups, county cups, EFL Trophy, Welsh Cup qualifying) are not covered.
- Followed clubs in a cup are listed first. A club's name is shown as spelt in `config/teams.json` (for example "MK Dons", not "Milton Keynes Dons").

### Southern League feed

The fixtures page (<https://www.southern-football-league.co.uk/fixtures>) is a JavaScript app, so its HTML holds no
fixtures. The build reads the JSON API the page itself loads, in `scripts/collect/southern-league.mjs`:

- `GET https://api.southern-football-league.co.uk/matches` with header `X-TENANT-ID: sfl`, the Premier South competition, the page's own 60-day window, following `pagination.hasNextPage`.
- One extra request reads FA Trophy ties for Southern League clubs. They appear in the FA Trophy section, not the Premier South one.
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
4. If a source spells a club differently, add an entry to `aliases`. For a Cymru North or Welsh Cup club whose name looks wrong, add its faw.cymru URL slug to `fawSlugNames` (many are built in).
5. The cup sections have their own lists (`FA Cup`, `FA Trophy`, `FAW Welsh Cup`). A club in a Welsh Cup list also gets its ground and postcode from `cymruNorthGrounds`.
6. `fallbackGrounds` supplies a ground only when the EFL feed has none. Its use is flagged in the notes.

## Layout

```text
config/teams.json        followed teams, Cymru North grounds, aliases, fallback grounds
scripts/collect/*.mjs    one module per source: returns normalised fixtures, notes and success or failure
                         (faw.mjs is the shared faw.cymru reader; fa.mjs reads the FA Cup and FA Trophy pages)
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
