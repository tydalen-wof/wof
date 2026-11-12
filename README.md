# wof (yr wythnos o'flaen)

Publishes the Southern League Premier South fixtures as `data/premier-south.json`.

Live file (once Pages serves `main`): https://gdoutch.github.io/wof/data/premier-south.json
With Pages on (Settings > Pages > Deploy from branch > main, root) it is served from there.

## Where the data comes from

The fixtures page (https://www.southern-football-league.co.uk/fixtures) is a JavaScript app, so its HTML contains no fixtures. The page loads them from its own JSON API:

- `GET https://api.southern-football-league.co.uk/matches`
  - header `X-TENANT-ID: sfl` (the tenant id from the page's own config)
  - `competition=69d0bd99b616bafb97331d3f` (Premier South)
  - `period=Days&periodLimit=60`: the page's own relative window, from today
  - `status=fixture&sort=asc&limit=100&page=N`, following `pagination.hasNextPage`

This endpoint is undocumented and can change without notice. The scraper fails loudly if it does.

## Output: `data/premier-south.json`

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

Postponed fixtures keep their place in the list with `status: "postponed"` (shown as "P-P" on the site). A postponed fixture has no rescheduled date in the source.

Dates: the API's `dateTime` carries the UK local calendar date (its trailing `Z` is not a true UTC instant), and `time` is the local kick-off. The scraper uses those directly, so no season or year is assumed.

## Failure behaviour

The scraper exits non-zero and writes nothing if any of these happen:

- an HTTP error from the API
- a match whose competition is not Premier South
- an unknown match status
- fewer matches received than the API reports (`pagination.totalItems`)
- zero fixtures

The workflow then fails visibly and does not commit. The file is written atomically.

## Running locally

Requires Node 20 or later. There are no dependencies.

```bash
node scripts/scrape.mjs
```

Behind an HTTP proxy, Node's `fetch` ignores `HTTPS_PROXY` unless `NODE_USE_ENV_PROXY=1` is also set (tested on Node 22.23).

## Schedule

`.github/workflows/southern-league.yml` runs on Thursdays and Sundays at 05:30 UTC, and on demand (`workflow_dispatch`). It commits `data/premier-south.json` only when the content changes. Scheduled runs are delayed by GitHub during busy periods.

## Politeness

One request per page of results (two at present), spaced by one second, with the user agent `wof-fixtures-bot/1.0 (+https://github.com/gdoutch/wof)`. No retries.
