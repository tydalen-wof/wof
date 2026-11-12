// Browser fallback for the Southern League fixtures page, which builds its list with JavaScript.
// The build uses the Southern League's JSON feed first (see collect/southern-league.mjs) and calls this only if that fails.
//   node scripts/scrape.mjs        writes data/premier-south.json from the rendered page
//
// Page text layout: a date line ("Saturday 14 November 2026"), then one block per division (an all-caps heading,
// then rows of: home / time-or-P-P / away). The PREMIER SOUTH heading therefore repeats once per date.
import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { USER_AGENT } from './lib/http.mjs';
import { makeFixture } from './lib/fixture.mjs';
import { monthNumber } from './lib/time.mjs';

export const PAGE_URL = 'https://www.southern-football-league.co.uk/fixtures';
export const DIVISION = 'PREMIER SOUTH';
const DATE_RE = /^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})$/i;
const STATUS_RE = /^(\d{1,2}:\d{2}|P-P|PP|POSTPONED|TBC|\d+\s*-\s*\d+)$/i;
const isHeading = l => /^[A-Z][A-Z ]{5,}$/.test(l) && !STATUS_RE.test(l);

/** Pure parser (unit-testable): rendered page text -> normalised fixtures. */
export function parsePremierSouthText(text, competition = 'Southern League Premier South', source = 'Southern League website (browser scrape)') {
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  const fixtures = [];
  const raw = [];
  let date = null, division = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const d = DATE_RE.exec(l);
    if (d) {
      const mon = monthNumber(d[2]);
      date = mon ? `${d[3]}-${String(mon).padStart(2, '0')}-${String(+d[1]).padStart(2, '0')}` : null;
      division = null;
      continue;
    }
    if (isHeading(l)) { division = l.toUpperCase(); continue; }
    if (division !== DIVISION) continue;
    raw.push(l);
    if (date && i > 0 && i < lines.length - 1 && STATUS_RE.test(l) && !isHeading(lines[i - 1])) {
      const status = l.toUpperCase();
      fixtures.push(makeFixture({
        date, time: /^\d{1,2}:\d{2}$/.test(status) ? status : null,
        home: lines[i - 1], away: lines[i + 1], competition,
        status: /^(P-P|PP|POSTPONED)$/.test(status) ? 'postponed' : 'scheduled', source,
      }));
    }
  }
  return { fixtures, raw };
}

/** Renders the page in Chromium. Playwright is imported only here, so the rest of the build never needs a browser. */
export async function scrapePremierSouth() {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ userAgent: USER_AGENT });
    await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    const text = await page.evaluate(() => document.body.innerText);
    return { ...parsePremierSouthText(text), text };
  } finally { await browser.close(); }
}

export function writePremierSouthJson(path, { fixtures, via, source, raw = [] }) {
  mkdirSync('data', { recursive: true });
  writeFileSync(path, JSON.stringify({
    source, via, fetchedAt: new Date().toISOString(), division: DIVISION,
    count: fixtures.length, postponed: fixtures.filter(f => f.status === 'postponed').length,
    fixtures, rawSection: raw,
  }, null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { fixtures, raw } = await scrapePremierSouth();
  writePremierSouthJson('data/premier-south.json', { fixtures, raw, via: 'browser scrape', source: PAGE_URL });
  console.log(`Wrote ${fixtures.length} fixtures (${fixtures.filter(f => f.status === 'postponed').length} postponed) to data/premier-south.json.`);
  if (!fixtures.length) process.exit(1);
}
