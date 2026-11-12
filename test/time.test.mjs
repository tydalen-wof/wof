import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromCET, fromET, utcToUk, isoToUk, londonToday, windowFor, addDays, londonStamp, wallToUtcMs } from '../scripts/lib/time.mjs';

// UK clocks: BST starts Sun 29 Mar 2026 and ends Sun 25 Oct 2026 (01:00 UTC both times).
// Central Europe changes at the same instant, so CET -> UK is always one hour earlier.
// US Eastern changes on 8 Mar and 1 Nov 2026, so the ET -> UK gap shifts between 4 and 5 hours.

test('CET to UK: winter (GMT)', () => {
  assert.deepEqual(fromCET('2026-11-17', '20:45'), { date: '2026-11-17', time: '19:45' });
});

test('CET to UK: summer (BST)', () => {
  assert.deepEqual(fromCET('2026-07-04', '20:45'), { date: '2026-07-04', time: '19:45' });
});

test('CET to UK: day before and day of the spring change', () => {
  assert.deepEqual(fromCET('2026-03-28', '20:45'), { date: '2026-03-28', time: '19:45' }); // CET -> GMT
  assert.deepEqual(fromCET('2026-03-29', '20:45'), { date: '2026-03-29', time: '19:45' }); // CEST -> BST
  assert.deepEqual(fromCET('2026-03-29', '04:00'), { date: '2026-03-29', time: '03:00' });
});

test('CET to UK: day before and day of the autumn change', () => {
  assert.deepEqual(fromCET('2026-10-24', '20:45'), { date: '2026-10-24', time: '19:45' }); // CEST -> BST
  assert.deepEqual(fromCET('2026-10-25', '20:45'), { date: '2026-10-25', time: '19:45' }); // CET -> GMT
  assert.deepEqual(fromCET('2026-10-25', '04:00'), { date: '2026-10-25', time: '03:00' });
});

test('CET to UK: crosses midnight backwards', () => {
  assert.deepEqual(fromCET('2026-11-17', '00:30'), { date: '2026-11-16', time: '23:30' });
});

test('CET to UK: spring 2027 change (28 Mar)', () => {
  assert.deepEqual(fromCET('2027-03-27', '18:00'), { date: '2027-03-27', time: '17:00' });
  assert.deepEqual(fromCET('2027-03-28', '18:00'), { date: '2027-03-28', time: '17:00' });
});

test('ET to UK: normal winter gap is 5 hours', () => {
  assert.deepEqual(fromET('2026-01-17', '12:00'), { date: '2026-01-17', time: '17:00' });
  assert.deepEqual(fromET('2026-11-14', '12:00'), { date: '2026-11-14', time: '17:00' }); // ESPN: "Sat 14 Nov 12:00 pm GMT-05:00"
});

test('ET to UK: normal summer gap is 5 hours', () => {
  assert.deepEqual(fromET('2026-07-04', '12:00'), { date: '2026-07-04', time: '17:00' });
});

test('ET to UK: US summer time starts 8 Mar, UK still on GMT until 29 Mar (gap 4 hours)', () => {
  assert.deepEqual(fromET('2026-03-07', '12:00'), { date: '2026-03-07', time: '17:00' }); // EST
  assert.deepEqual(fromET('2026-03-09', '12:00'), { date: '2026-03-09', time: '16:00' }); // EDT, UK GMT
  assert.deepEqual(fromET('2026-03-28', '12:00'), { date: '2026-03-28', time: '16:00' });
  assert.deepEqual(fromET('2026-03-30', '12:00'), { date: '2026-03-30', time: '17:00' }); // EDT, UK BST
});

test('ET to UK: UK leaves BST on 25 Oct, US stays on EDT until 1 Nov (gap 4 hours)', () => {
  assert.deepEqual(fromET('2026-10-24', '12:00'), { date: '2026-10-24', time: '17:00' }); // EDT, UK BST
  assert.deepEqual(fromET('2026-10-26', '12:00'), { date: '2026-10-26', time: '16:00' }); // EDT, UK GMT
  assert.deepEqual(fromET('2026-10-31', '12:00'), { date: '2026-10-31', time: '16:00' });
  assert.deepEqual(fromET('2026-11-01', '12:00'), { date: '2026-11-01', time: '17:00' }); // EST again
});

test('ET to UK: crosses midnight forwards', () => {
  assert.deepEqual(fromET('2026-03-07', '20:00'), { date: '2026-03-08', time: '01:00' });
  assert.deepEqual(fromET('2026-11-14', '19:30'), { date: '2026-11-15', time: '00:30' });
});

test('ET to UK: spring 2027 (US 14 Mar, UK 28 Mar)', () => {
  assert.deepEqual(fromET('2027-03-15', '15:00'), { date: '2027-03-15', time: '19:00' });
  assert.deepEqual(fromET('2027-03-29', '15:00'), { date: '2027-03-29', time: '20:00' });
});

test('UTC to UK follows GMT/BST', () => {
  assert.deepEqual(utcToUk(Date.UTC(2026, 10, 14, 15, 0)), { date: '2026-11-14', time: '15:00' });
  assert.deepEqual(utcToUk(Date.UTC(2026, 5, 1, 11, 0)), { date: '2026-06-01', time: '12:00' });
  assert.deepEqual(isoToUk('2026-10-25T00:59:00Z'), { date: '2026-10-25', time: '01:59' }); // last BST minute
  assert.deepEqual(isoToUk('2026-10-25T01:00:00Z'), { date: '2026-10-25', time: '01:00' }); // clocks back
  assert.deepEqual(isoToUk('2026-03-29T00:59:00Z'), { date: '2026-03-29', time: '00:59' });
  assert.deepEqual(isoToUk('2026-03-29T01:00:00Z'), { date: '2026-03-29', time: '02:00' }); // clocks forward
  assert.equal(isoToUk('not a date'), null);
});

test('wallToUtcMs round-trips', () => {
  assert.equal(new Date(wallToUtcMs('2026-11-14', '12:00', 'America/New_York')).toISOString(), '2026-11-14T17:00:00.000Z');
});

test('londonToday uses the UK date, not the UTC date', () => {
  assert.equal(londonToday(new Date('2026-06-30T23:30:00Z')), '2026-07-01'); // 00:30 BST
  assert.equal(londonToday(new Date('2026-12-30T23:30:00Z')), '2026-12-30'); // 23:30 GMT
});

test('window: Thursday run covers Thursday to the Sunday after next (11 days)', () => {
  assert.deepEqual(windowFor('2026-11-12'), { start: '2026-11-12', end: '2026-11-22' });
  assert.deepEqual(windowFor('2026-03-26'), { start: '2026-03-26', end: '2026-04-05' });   // spans the BST change
});

test('window: other run days still end on the Sunday after next', () => {
  assert.deepEqual(windowFor('2026-11-15'), { start: '2026-11-15', end: '2026-11-29' });   // Sunday
  assert.deepEqual(windowFor('2026-11-14'), { start: '2026-11-14', end: '2026-11-22' });   // Saturday
});

test('addDays crosses month and year ends', () => {
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('londonStamp labels GMT and BST', () => {
  assert.match(londonStamp(new Date('2026-11-12T05:30:00Z')), /^2026-11-12 05:30 GMT$/);
  assert.match(londonStamp(new Date('2026-07-09T05:30:00Z')), /^2026-07-09 06:30 BST$/);
});
