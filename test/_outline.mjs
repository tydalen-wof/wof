const unescape = s => s.replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// ---- One outline of the page's structure (no styling), so any layout change shows up in review.
export function outline(html) {
  const main = html.slice(html.indexOf('<main>'), html.indexOf('</main>'));
  const text = s => unescape(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  const out = [];
  let depth = 0, row = null;
  const pad = () => '  '.repeat(depth);
  for (const line of main.split('\n')) {
    let m;
    if (line.startsWith('</details>')) { depth--; continue; }
    if ((m = /^<details class="([^"]*)">/.exec(line))) { out.push(`${pad()}details.${m[1].replace(/ /g, '.')}`); depth++; continue; }
    if ((m = /^<summary class="([^"]*)">(.*)/.exec(line))) { out.push(`${pad()}summary.${m[1]}${m[2] ? ' ' + text(m[2]) : ''}`); continue; }
    if ((m = /^<section class="([^"]*)">(.*)<\/section>/.exec(line))) { out.push(`${pad()}section.${m[1]} ${text(m[2])}`); continue; }
    if (line.startsWith('<div class="row">')) { row = []; continue; }
    if (row && (m = /^<div class="(when|match|venue)">(.*)<\/div>/.exec(line))) {
      row.push(text(m[2]));
      if (m[1] === 'venue') { out.push(`${pad()}row | ${row.join(' | ')}`); row = null; }
      continue;
    }
    if ((m = /^<p class="(day|sub)">(.*)<\/p>/.exec(line))) { out.push(`${pad()}${m[1]}: ${text(m[2])}`); continue; }
    if (/^<div class="rest-line">/.test(line)) { out.push(`${pad()}rest-line: ${text(line)}`); continue; }
    if (/^<div class="rest-body">/.test(line)) { out.push(`${pad()}rest-body`); continue; }
  }
  return out.join('\n') + '\n';
}

