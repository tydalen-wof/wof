import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sniff, MAX_BYTES } from '../scripts/fetch-logos.mjs';
import { SECTIONS } from '../scripts/build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

test('file types come from the file\'s own bytes', () => {
  assert.equal(sniff(PNG), 'png');
  assert.equal(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), 'jpg');
  assert.equal(sniff(Buffer.from('GIF89a......')), 'gif');
  assert.equal(sniff(Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ')])), 'webp');
  assert.equal(sniff(Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="10"><path d="M0 0"/></svg>')), 'svg');
  assert.equal(sniff(Buffer.from('<svg viewBox="0 0 1 1"></svg>')), 'svg');
});

test('anything that is not a plain image is refused: HTML pages, scripted SVGs, empty or random data', () => {
  assert.equal(sniff(Buffer.from('<!doctype html><html><body>404</body></html>')), null);
  assert.equal(sniff(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), null);
  assert.equal(sniff(Buffer.from('')), null);
  assert.equal(sniff(Buffer.from('hello world')), null);
  assert.equal(sniff(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9])), null);
  assert.ok(MAX_BYTES <= 512 * 1024, 'logos stay small');
});

test('config/logos.json: every section has a logo entry whose file exists, with no orphans', () => {
  const { logos } = JSON.parse(readFileSync(join(ROOT, 'config/logos.json'), 'utf8'));
  assert.deepEqual(Object.keys(logos).sort(), SECTIONS.map(s => s.key).sort(), 'one logo per competition');
  for (const [key, e] of Object.entries(logos)) {
    assert.match(e.url, /^https:\/\//, `${key}: the source is https`);
    assert.ok(e.source, `${key}: says where it came from`);
    assert.match(e.file, /^assets\/logos\/[a-z0-9-]+\.(svg|png|webp|jpg|gif)$/, `${key}: file path`);
    assert.ok(existsSync(join(ROOT, e.file)), `${key}: ${e.file} exists`);
    assert.equal(sniff(readFileSync(join(ROOT, e.file))) !== null, true, `${key}: ${e.file} is a usable image`);
    assert.ok(e.chip === undefined || e.chip === 'dark', `${key}: chip is dark or unset`);
  }
});

test('every logo the built page refers to exists', { skip: !existsSync(join(ROOT, 'index.html')) && 'index.html has not been built' }, () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<img class="comp-logo[^"]*" src="([^"]+)"/g)].map(m => m[1]);
  assert.ok(srcs.length > 0, 'the built page shows logos');
  for (const src of srcs) assert.ok(existsSync(join(ROOT, src)), `${src} exists`);
});
