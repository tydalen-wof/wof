// All time handling goes through Intl, so GMT/BST (and CET/CEST, EST/EDT) changes are never hard-coded.
export const LONDON = 'Europe/London';
export const CET_ZONE = 'Europe/Berlin';       // CET/CEST: switches on the same instant as the UK
export const ET_ZONE = 'America/New_York';     // EST/EDT: switches on different dates to the UK

const fmtCache = new Map();
function fmt(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(tz, new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  }
  return fmtCache.get(tz);
}

/** Wall-clock parts of an instant in a zone. */
export function partsInZone(ms, tz) {
  const o = {};
  for (const p of fmt(tz).formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, hh: +o.hour, mm: +o.minute, ss: +o.second };
}

/** Wall-clock minus UTC, in minutes, for an instant in a zone. */
export function offsetMinutes(ms, tz) {
  const p = partsInZone(ms, tz);
  return (Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(ms / 1000) * 1000) / 60000;
}

/** Interpret a wall-clock date/time in a zone and return the UTC instant (ms). */
export function wallToUtcMs(date, time, tz) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wall - offsetMinutes(wall, tz) * 60000;
  guess = wall - offsetMinutes(guess, tz) * 60000;      // second pass settles dates next to a changeover
  return guess;
}

const pad = n => String(n).padStart(2, '0');

/** UTC instant -> { date: 'YYYY-MM-DD', time: 'HH:MM' } in UK time. */
export function utcToUk(ms) {
  const p = partsInZone(ms, LONDON);
  return { date: `${p.y}-${pad(p.m)}-${pad(p.d)}`, time: `${pad(p.hh)}:${pad(p.mm)}` };
}

/** Wall-clock date/time in another zone -> UK date/time. */
export function convertWall(date, time, fromTz) {
  return utcToUk(wallToUtcMs(date, time, fromTz));
}
export const fromCET = (date, time) => convertWall(date, time, CET_ZONE);
export const fromET = (date, time) => convertWall(date, time, ET_ZONE);

/** ISO string (with Z or offset) or epoch ms -> UK date/time. */
export function isoToUk(iso) {
  const ms = typeof iso === 'number' ? iso : Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return utcToUk(ms);
}

export function londonToday(now = new Date()) {
  return utcToUk(now.getTime()).date;
}

export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function dayOfWeek(date) {            // 0 = Sunday
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Today through the Sunday after next (Thursday run: 11 days inclusive). */
export function windowFor(today) {
  const toNextSunday = (7 - dayOfWeek(today)) % 7 || 7;
  return { start: today, end: addDays(today, toNextSunday + 7) };
}

export const inWindow = (date, w) => !!date && date >= w.start && date <= w.end;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const monthName = m => MONTHS[m - 1];
export function longDate(date) {             // "Saturday 21 November"
  const [y, m, d] = date.split('-').map(Number);
  return `${DAYS[dayOfWeek(date)]} ${d} ${MONTHS[m - 1]}`;
}
export function shortDate(date) {            // "Sat 21 Nov"
  const [y, m, d] = date.split('-').map(Number);
  return `${DAYS[dayOfWeek(date)].slice(0, 3)} ${d} ${MONTHS[m - 1].slice(0, 3)}`;
}
export function rangeLabel(w) {              // "12 Nov to 22 Nov 2026"
  const f = s => { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; };
  const a = f(w.start), b = f(w.end);
  const A = `${a.d} ${MONTHS[a.m - 1].slice(0, 3)}`;
  return `${A}${a.y !== b.y ? ' ' + a.y : ''} to ${b.d} ${MONTHS[b.m - 1].slice(0, 3)} ${b.y}`;
}
export function londonStamp(now = new Date()) {   // "2026-11-12 05:31 GMT"
  const uk = utcToUk(now.getTime());
  const off = offsetMinutes(now.getTime(), LONDON);
  return `${uk.date} ${uk.time} ${off === 0 ? 'GMT' : 'BST'}`;
}
export function monthNumber(name) {
  const i = MONTHS.findIndex(m => m.toLowerCase().startsWith(String(name).slice(0, 3).toLowerCase()));
  return i < 0 ? null : i + 1;
}
