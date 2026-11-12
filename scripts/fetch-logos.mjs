// Downloads the competition logos listed in config/logos.json to assets/logos/.
//   node scripts/fetch-logos.mjs              fetch any logo not yet downloaded
//   node scripts/fetch-logos.mjs --force      fetch them all again
//   node scripts/fetch-logos.mjs premier-league fa-cup     fetch only these (always re-fetched)
// One request per logo, spaced by a second, no retries. The file type is decided from the file's own bytes, and anything
// that is not an image, or is unreasonably large, is refused. This is a maintenance script: the weekly build never runs it.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { USER_AGENT, sleep } from './lib/http.mjs';

export const CONFIG = 'config/logos.json';
export const DIR = 'assets/logos';
export const MAX_BYTES = 300 * 1024;

/** Image type from the first bytes (never from the server's say-so). Returns an extension or null. */
export function sniff(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.subarray(0, 6).toString('latin1'))) return 'gif';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  const head = buf.subarray(0, 1024).toString('utf8');
  if (/<svg[\s>]/i.test(head) && !/<script/i.test(buf.toString('utf8'))) return 'svg';    // an SVG with a script is refused
  return null;
}

export async function download(url) {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'image/*' }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error(`${buf.length} bytes is larger than the ${MAX_BYTES} limit`);
  const ext = sniff(buf);
  if (!ext) throw new Error('not a usable image (or an SVG containing a script)');
  return { buf, ext };
}

export async function main(argv, { log = console.log, today = new Date().toISOString().slice(0, 10) } = {}) {
  const force = argv.includes('--force');
  const wanted = argv.filter(a => !a.startsWith('--'));
  const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
  mkdirSync(DIR, { recursive: true });
  let failed = 0, done = 0;
  for (const [key, entry] of Object.entries(config.logos)) {
    if (wanted.length && !wanted.includes(key)) continue;
    if (!wanted.length && !force && entry.file && existsSync(entry.file)) { log(`${key}: already have ${entry.file}`); continue; }
    try {
      if (done++) await sleep(1000);
      const { buf, ext } = await download(entry.url);
      const file = `${DIR}/${key}.${ext}`;
      writeFileSync(file, buf);
      entry.file = file; entry.retrievedAt = today; entry.bytes = buf.length;
      log(`${key}: ${file} (${buf.length} bytes)`);
    } catch (e) { failed++; log(`${key}: FAILED ${e.message}`); }
  }
  writeFileSync(CONFIG, JSON.stringify(config, null, 2) + '\n');
  return failed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(failed => { if (failed) process.exit(1); });
}
