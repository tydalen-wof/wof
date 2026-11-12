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

- Output: `index.html`, `data/fixtures.json`, and any new teams added to `data/postcodes.json` (see Postcodes).
- Window: run date through the Sunday after next (Thursday to Sunday, 11 days).
- The build fails, and writes nothing, if no source can be read for the Premier League or the Championship.
- Behind an HTTP proxy, Node's `fetch` ignores `HTTPS_PROXY` unless `NODE_USE_ENV_PROXY=1` is also set.

## Publishing

- Pages: Settings > Pages > Deploy from branch > `main` / root.
- `.github/workflows/report.yml` runs Thursdays 05:30 UTC and on demand (Actions > Weekly fixtures report > Run workflow).
- It builds, tests, then commits `index.html`, `data/fixtures.json` and `data/postcodes.json` if they changed. A failed build or test commits nothing.
- Scheduled runs can be delayed by GitHub during busy periods. The page states its own checked-at time.

## Page layout

Four top-level groups, each a collapsed accordion with an icon in its header, holding its competitions (also collapsed), then "Before you travel". Clicking a group's icon or title opens its competition cards:

| Group (icon) | Competitions |
| --- | --- |
| International (Wales crest) | Wales men's internationals; Other UK and European internationals |
| Welsh (Cymru Leagues) | Novira Cymru North; FAW Welsh Cup |
| English (Premier League) | Premier League; Championship; League One; Southern League Premier South; FA Cup; FA Trophy |
| European clubs (Champions League) | UEFA Champions League; UEFA Europa League |

- Inside a competition, followed teams' games come first, then an "Other fixtures" line (with a match count) that opens the rest.
- **A competition is left off the page** when none of its named teams (its list under `followed` in `config/teams.json`) plays in it this week, or it has no games. A group with no competitions to show is left off too. The notes name what was left out. This week that is the FA Cup, FA Trophy, Champions League and Europa League.
- **Exception:** a competition whose source could not be read, or whose list is known to be incomplete, is always shown with a warning, because nobody can say that no named team is involved.
- Each competition has a small logo beside its title, and each group a larger icon in its header (see Logos).
- To move a competition between groups, or reorder them, edit `SECTIONS` in `scripts/build.mjs`.

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
| UEFA Champions League, UEFA Europa League | UEFA official feed (one request for both); cross-check: Sky Sports. ESPN's default pages show only past matchdays, so it is not used |

Not used: ESPN's API host and Football Web Pages (both refuse automated requests); TNT, VAVEL and isthefootballon
(no complete fixture list); Sky (it has no FA Trophy page).
ESPN's default schedule pages show only some match days, so they are compared only on the days they show.

### Cup sections

- The FA's pages list only the **next round**, with no venues and no postponement status. A tie from a later round does not appear until that round is next.
- **FA Trophy:** the FA page and the Southern League feed list different ties, so neither is a complete list. Ties only the Southern League feed lists are added and named in the notes. Check thefa.com for the rest.
- **FA Cup:** nothing is shown (a bare heading) when no tie falls in the window.
- **FAW Welsh Cup:** the page lists every tie drawn so far whatever `?currentDate=` says, so the plain address is used. Venues are TBC except for followed Cymru North clubs' home ties, which show their ground and postcode.
- Other cups (Southern League cups, county cups, EFL Trophy, Welsh Cup qualifying) are not covered.
- **European competitions:** the followed list is the English clubs you follow (Leeds United, Manchester United, Liverpool), so a matchday without them is not shown. Add a club to `UEFA Champions League` or `UEFA Europa League` in `config/teams.json` to follow it there. Sky and UEFA spell some clubs differently; the `aliases` table handles the ones seen so far, and the notes name any that still need an alias.
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

## Logos

Each competition has a logo, saved in `assets/logos/` and served with the page (nothing is fetched from other sites when the page loads).
`config/logos.json` records where each one came from.

- **UEFA's own CDN:** Nations League, Champions League, Europa League and the Wales crest (the URLs the UEFA match feed itself gives).
- **faw.cymru:** Cymru Leagues, and the FAW crest (used for the Welsh Cup, which has no separate logo on the site).
- **southern-football-league.co.uk:** the Southern League logo.
- **thefa.com:** The FA crest (used for the FA Trophy, which has no separate logo there).
- **ESPN's CDN:** Premier League, Championship, League One and FA Cup. The Premier League and EFL sites publish no competition logo that can be fetched.
- **Group icons** (the larger icon in each group header): the FAW crest (International), the Cymru Leagues logo (Welsh), the white Premier League logo on purple (English, from ESPN's "dark" set) and the white Champions League logo on navy, cropped to the starball (European clubs, from UEFA's CDN). They are listed under `groups` in `config/logos.json`; fetch one with `node scripts/fetch-logos.mjs "group:Welsh"`.
- White logos (Wales, Southern League) sit on a dark chip; the rest sit on white, so all read in both themes. `chip` can be `dark`, `purple` or `navy`.
- **Refresh or add one:** edit `config/logos.json`, then `node scripts/fetch-logos.mjs [--force] [key ...]`. It refuses anything that is not a plain image (HTML, scripted SVG, over 300 KB). The weekly build never fetches logos.
- Logos are trademarks of their owners and are used only to identify the competition. Remove `assets/logos/` and the page still works, just without icons.

## Postcodes

`data/postcodes.json` is a lookup of known non-league home grounds, keyed by team, reused every week.

```json
"Holyhead Hotspur": { "venue": "The New Oval", "postcode": "LL65 2YE", "source": "...", "added": "2026-11-12", "caveat": "..." }
```

- **No source publishes postcodes** (checked: the Southern League feed, the FAW site, the FA and the EFL feeds), and the build never guesses one. They are added by hand when discovered.
- **Add one:** `node scripts/postcodes.mjs add "Team" "AB1 2CD" --venue "Ground" --source "where you found it" --note "caveat"`. It checks the format, and refuses to change a stored postcode unless you add `--replace`.
- **See what is missing:** `node scripts/postcodes.mjs missing`. The page's "Before you travel" notes also list this week's home grounds with no postcode.
- **The build adds each non-league home team it sees** (Southern League, Cymru North, Welsh Cup, FA Trophy) with `postcode: null`, and the Southern League's ground name. It never overwrites a stored value. The workflow commits those additions.
- **On the page:** a known postcode shows under the venue on that team's home games. A followed club's home game with none stored says "Postcode not found". Other clubs show nothing.
- A stored ground fills a missing venue. If a feed names a different ground for a tie (a cup tie moved, say), the stored postcode is withheld and the notes say why.
- `caveat` is printed in the notes whenever that postcode is shown. Keep `aliases` in `config/teams.json` up to date if a club is spelt differently in different sources.

## Followed teams

Edit `config/teams.json` and rebuild. No code changes.

```json
"followed": {
  "Premier League": ["Leeds United", "Manchester United", "Liverpool"]
}
```

1. Add the name to the right section's list. Order matters: earlier teams are listed first.
2. Use the spelling the main source uses (see `data/fixtures.json`). The build adds a note if a followed team is not found.
3. Postcodes live in `data/postcodes.json`, not here (see Postcodes).
4. If a source spells a club differently, add an entry to `aliases`. For a Cymru North or Welsh Cup club whose name looks wrong, add its faw.cymru URL slug to `fawSlugNames` (many are built in).
5. The cup sections have their own lists (`FA Cup`, `FA Trophy`, `FAW Welsh Cup`). A club's ground and postcode come from `data/postcodes.json`.
6. `fallbackGrounds` supplies a ground only when the EFL feed has none. Its use is flagged in the notes.

## Layout

```text
config/teams.json        followed teams, aliases, fallback grounds
data/postcodes.json      lookup of known non-league grounds and postcodes (grows as teams are seen)
scripts/collect/*.mjs    one module per source: returns normalised fixtures, notes and success or failure
                         (faw.mjs is the shared faw.cymru reader; fa.mjs reads the FA Cup and FA Trophy pages)
scripts/lib/             UK-time helpers (Intl), HTTP helper, team-name matching, reconciliation,
                         postcode lookup, and the rule for leaving a competition off the page
scripts/build.mjs        collect, reconcile, write JSON and HTML
scripts/render.mjs       data to HTML
scripts/postcodes.mjs    command line for the postcode lookup (add, missing, show)
scripts/fetch-logos.mjs  downloads the competition logos named in config/logos.json (maintenance, not part of the build)
assets/logos/            the logo files; config/logos.json records their sources
test/                    unit tests and the HTML structure snapshot
```

Fixture shape: `{ date, time|null, home, away, venue|null, competition, tag|null, status, sources[] }`.

## Tests

`npm test` covers GMT/BST, CET and US Eastern conversions across changeover dates, each source parser, the
majority/tie/postponement logic, the Southern League feed checks, and the page structure (nothing open, no `h3`, section order,
postcodes only on followed Cymru North home games). If the page structure changes on purpose, review the diff and run
`UPDATE_SNAPSHOT=1 npm test`.
