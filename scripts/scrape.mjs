// Renders the Southern League fixtures page in a real browser, then writes
// data/premier-south.json with the PREMIER SOUTH section (including P-P postponements).
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const URL = 'https://www.southern-football-league.co.uk/fixtures';
const DIVISION = 'PREMIER SOUTH';
const DATE_RE = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+\d{1,2}/i;
const STATUS_RE = /^(\d{1,2}:\d{2}|P-P|PP|POSTPONED|TBC|\d+\s*-\s*\d+)$/i;

const browser = await chromium.launch();
const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (compatible; wof-fixtures-bot; +https://github.com/gdoutch/wof)' });

// Log data requests, so a JSON feed can be found and used instead of scraping.
const feeds = [];
page.on('response', r => {
  const ct = r.headers()['content-type'] || '';
  if (ct.includes('json')) feeds.push(`${r.status()} ${r.url()}`);
});

await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3000);
const text = await page.evaluate(() => document.body.innerText);
await browser.close();

const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
const start = lines.findIndex(l => l.toUpperCase() === DIVISION);
if (start < 0) {
  console.error(`No "${DIVISION}" heading found. First lines:\n` + lines.slice(0, 40).join('\n'));
  process.exit(1);
}

// Section ends at the next all-caps heading (e.g. PREMIER CENTRAL, DIVISION ONE).
const isHeading = l => /^[A-Z][A-Z ]{5,}$/.test(l) && !STATUS_RE.test(l);
let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (isHeading(lines[i])) { end = i; break; }
}
const section = lines.slice(start + 1, end);

// Rows appear as: home / time-or-P-P / away.
const fixtures = [];
let date = null;
for (let i = 0; i < section.length; i++) {
  if (DATE_RE.test(section[i])) { date = section[i]; continue; }
  if (i > 0 && i < section.length - 1 && STATUS_RE.test(section[i]) && !DATE_RE.test(section[i - 1])) {
    const status = section[i].toUpperCase();
    fixtures.push({
      date,
      home: section[i - 1],
      away: section[i + 1],
      status: /^(P-P|PP|POSTPONED)$/.test(status) ? 'postponed' : status,
    });
  }
}

mkdirSync('data', { recursive: true });
writeFileSync('data/premier-south.json', JSON.stringify({
  source: URL,
  fetchedAt: new Date().toISOString(),
  division: DIVISION,
  count: fixtures.length,
  fixtures,
  rawSection: section,   // kept so a parsing miss can be spotted by eye
  jsonFeedsSeen: feeds,  // candidates for a direct API, if one exists
}, null, 2));
console.log(`Wrote ${fixtures.length} fixtures (${fixtures.filter(f => f.status === 'postponed').length} postponed).`);
if (!fixtures.length) process.exit(1);
