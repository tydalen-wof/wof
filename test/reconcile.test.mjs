import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile } from '../scripts/lib/reconcile.mjs';
import { makeFixture, result, failure } from '../scripts/lib/fixture.mjs';
import { makeResolver, teamKey } from '../scripts/lib/teams.mjs';

const W = { start: '2026-11-12', end: '2026-11-22' };
const fx = (home, away, o = {}) => makeFixture({ date: '2026-11-21', time: '15:00', competition: 'Test', source: o.source ?? 'A', home, away, ...o });
const src = (name, fixtures, o = {}) => result({ name, url: 'https://example.test/' + name }, { fixtures, ...o });

test('agreeing sources produce no conflicts and list every source on the fixture', () => {
  const rec = reconcile({ competition: 'Test', window: W, results: [src('A', [fx('Chelsea', 'Leeds United')], { complete: true }), src('B', [fx('Chelsea', 'Leeds United')], { complete: false })] });
  assert.equal(rec.conflicts.length, 0);
  assert.deepEqual(rec.fixtures[0].sources, ['A', 'B']);
});

test('time disagreement: the majority wins over the base source', () => {
  const rec = reconcile({
    competition: 'Test', window: W,
    results: [
      src('A', [fx('Chelsea', 'Leeds United', { time: '17:30' })], { complete: true }),
      src('B', [fx('Chelsea', 'Leeds United', { time: '15:00' })]),
      src('C', [fx('Chelsea', 'Leeds United', { time: '15:00' })]),
    ],
  });
  assert.equal(rec.fixtures[0].time, '15:00');
  assert.equal(rec.conflicts.length, 1);
  assert.match(rec.conflicts[0].text, /kick-off time differs \(A 17:30, B 15:00, C 15:00\)/);
  assert.match(rec.conflicts[0].text, /majority/);
});

test('a two-way tie keeps the base (official) value and says so', () => {
  const rec = reconcile({ competition: 'Test', window: W, results: [src('A', [fx('Chelsea', 'Leeds United', { time: '17:30' })], { complete: true }), src('B', [fx('Chelsea', 'Leeds United', { time: '15:00' })])] });
  assert.equal(rec.fixtures[0].time, '17:30');
  assert.match(rec.conflicts[0].text, /tie/);
});

test('home/away disagreement: the majority order wins and the venue is not carried over', () => {
  const rec = reconcile({
    competition: 'Test', window: W,
    results: [
      src('A', [fx('Chelsea', 'Leeds United', { venue: 'Stamford Bridge' })], { complete: true }),
      src('B', [fx('Leeds United', 'Chelsea')]),
      src('C', [fx('Leeds United', 'Chelsea', { venue: 'Elland Road' })]),
    ],
  });
  const f = rec.fixtures[0];
  assert.equal(f.home, 'Leeds United');
  assert.equal(f.away, 'Chelsea');
  assert.equal(f.venue, 'Elland Road');
  assert.ok(rec.conflicts.some(c => c.kind === 'home team'));
});

test('postponed in any one source marks the game postponed and records the disagreement', () => {
  const rec = reconcile({ competition: 'Test', window: W, results: [src('A', [fx('Chelsea', 'Leeds United')], { complete: true }), src('B', [fx('Chelsea', 'Leeds United', { status: 'postponed' })])] });
  assert.equal(rec.fixtures[0].status, 'postponed');
  assert.ok(rec.conflicts.some(c => c.kind === 'postponed' && /marked postponed by B but not by A/.test(c.text)));
});

test('a game missing from a source that covers that day is a conflict; days a source does not cover are not', () => {
  const base = src('A', [fx('Chelsea', 'Leeds United'), fx('Arsenal', 'Spurs', { date: '2026-11-22' })], { complete: true });
  const check = src('B', [], { covers: new Set(['2026-11-21']) });
  const rec = reconcile({ competition: 'Test', window: W, results: [base, check] });
  const missing = rec.conflicts.filter(c => c.kind === 'missing');
  assert.equal(missing.length, 1);
  assert.match(missing[0].text, /Chelsea v Leeds United/);
});

test('a game another source lists but the base does not is reported, not added', () => {
  const rec = reconcile({ competition: 'Test', window: W, results: [src('A', [], { complete: true, teams: ['Chelsea', 'Leeds United'] }), src('B', [fx('Chelsea', 'Leeds United')])] });
  assert.equal(rec.fixtures.length, 0);
  assert.ok(rec.conflicts.some(c => c.kind === 'extra'));
});

test('an unrecognised team spelling is flagged as unverifiable, never as a missing game', () => {
  const base = src('A', [fx('Bosnia and Herzegovina', 'Romania')], { complete: true });
  const check = src('B', [fx('Bosnia-Herz.', 'Romania')]);
  const rec = reconcile({ competition: 'Test', window: W, results: [base, check] });
  assert.equal(rec.conflicts.filter(c => c.kind === 'missing').length, 0);
  assert.ok(rec.notes.some(n => /not recognised/.test(n) && /Bosnia-Herz/.test(n)));
});

test('a lenient source can disagree on times but never reports missing or extra games', () => {
  const base = src('A', [fx('Poole Town', 'Wimborne Town', { time: '19:45' })], { complete: true });
  const lenient = src('B', [fx('Poole Town', 'Wimborne Town', { time: '20:45' }), fx('Frome Town', 'Bath City')], { covers: new Set(['2026-11-21']) });
  lenient.lenient = true;
  const rec = reconcile({ competition: 'Test', window: W, results: [base, lenient] });
  assert.equal(rec.conflicts.filter(c => c.kind === 'missing' || c.kind === 'extra').length, 0);
  assert.equal(rec.conflicts.filter(c => c.kind === 'kick-off time').length, 1);
});

test('a single-club source only covers that club', () => {
  const base = src('A', [fx('Plymouth Parkway', 'Malvern Town'), fx('Frome Town', 'Bath City')], { complete: true });
  const club = src('Club', [fx('Plymouth Parkway', 'Malvern Town')]);
  club.scope = f => f.home === 'Plymouth Parkway' || f.away === 'Plymouth Parkway';
  const rec = reconcile({ competition: 'Test', window: W, results: [base, club] });
  assert.equal(rec.conflicts.length, 0);
});

test('fixtures outside the window are ignored', () => {
  const rec = reconcile({ competition: 'Test', window: W, results: [src('A', [fx('Chelsea', 'Leeds United', { date: '2026-12-01' })], { complete: true })] });
  assert.equal(rec.fixtures.length, 0);
});

test('if the official source fails the next complete source is the base, and the failure is noted', () => {
  const rec = reconcile({ competition: 'Test', window: W, results: [failure({ name: 'Official', url: 'x' }, new Error('HTTP 503')), src('B', [fx('Chelsea', 'Leeds United')], { complete: true })] });
  assert.equal(rec.base.name, 'B');
  assert.ok(rec.notes.some(n => /Official could not be read \(HTTP 503\)/.test(n)));
  assert.ok(rec.notes.some(n => /Official was unavailable, so B was used/.test(n)));
});

test('when every source fails there is no base (the build then refuses to publish a critical section)', () => {
  const rec = reconcile({ competition: 'Test', window: W, results: [failure({ name: 'A', url: 'x' }, new Error('nope')), failure({ name: 'B', url: 'y' }, new Error('nope'))] });
  assert.equal(rec.base, null);
  assert.equal(rec.fixtures.length, 0);
});

test('team resolver handles aliases (both ways), short names and punctuation', () => {
  const r = makeResolver(['Manchester United', 'Havant & Waterlooville', 'Evesham United', 'Türkiye', 'Sheffield United', 'Sheffield Wednesday'], { 'man utd': 'Manchester United', turkey: 'Türkiye' });
  assert.equal(r('Man Utd'), 'Manchester United');
  assert.equal(r('Havant & W'), 'Havant & Waterlooville');
  assert.equal(r('Evesham'), 'Evesham United');
  assert.equal(r('Turkey'), 'Türkiye');
  assert.equal(r('Sheffield'), null, 'ambiguous prefixes must not guess');
  assert.equal(r('Nobody FC'), null);
  assert.equal(teamKey('Sholing FC'), teamKey('Sholing'));
});

test('an "adds" source contributes ties the base list lacks, says so, and does not report them as conflicts', () => {
  const base = src('FA', [fx('Hebburn Town', 'Guiseley AFC', { tag: 'Second Round Proper' })], { complete: true, teams: ['Hebburn Town', 'Guiseley AFC'] });
  const feed = src('League feed', [
    fx('Hebburn Town', 'Guiseley', { venue: 'Hebburn Ground' }),               // same tie, spelt differently: a cross-check, not an addition
    fx('Bath City', 'Truro City', { venue: 'Twerton Park', tag: 'FA Trophy' }),  // a club the FA list does not know
  ]);
  feed.adds = true;
  const rec = reconcile({ competition: 'Test', window: W, results: [base, feed] });
  assert.equal(rec.fixtures.length, 2);
  const added = rec.fixtures.find(f => f.home === 'Bath City');
  assert.deepEqual([added.venue, added.tag, added.sources], ['Twerton Park', 'FA Trophy', ['League feed']]);
  assert.equal(rec.fixtures.find(f => f.home === 'Hebburn Town').venue, 'Hebburn Ground', 'a missing venue is filled from the cross-check');
  assert.ok(rec.notes.some(n => /1 tie\(s\) come only from League feed.*Bath City v Truro City/.test(n)));
  assert.equal(rec.conflicts.filter(c => c.kind === 'extra').length, 0);
});

test('an "adds" source that covers only its own clubs does not call other ties missing', () => {
  const base = src('FA', [fx('Hebburn Town', 'Guiseley AFC')], { complete: true, teams: ['Hebburn Town', 'Guiseley AFC'] });
  const feed = src('League feed', []);
  feed.adds = true;
  feed.scope = f => f.home === 'Bath City' || f.away === 'Bath City';
  assert.equal(reconcile({ competition: 'Test', window: W, results: [base, feed] }).conflicts.length, 0);
});

test('followed-name mapping is exact or alias only, so a different club is never renamed', () => {
  const canon = makeResolver(['MK Dons', 'Plymouth Argyle', 'Liverpool'], { 'milton keynes dons': 'MK Dons' }, { prefix: false });
  assert.equal(canon('Milton Keynes Dons'), 'MK Dons');
  assert.equal(canon('Plymouth Argyle'), 'Plymouth Argyle');
  assert.equal(canon('Liverpool Reserves'), null);
  assert.equal(canon('Plymouth Parkway'), null);
  assert.equal(canon('Plymouth'), null, 'no prefix guessing in this mode');
});

test('team names that differ by extra words or special letters still match, but ambiguous ones never do', () => {
  const r = makeResolver(['Leipzig', 'Paris', 'Bayern München', 'Inter', 'Lillestrøm', 'Real Madrid', 'Real Sociedad', 'Manchester City', 'Manchester United', 'Sheffield United', 'Sheffield Wednesday']);
  assert.equal(r('RB Leipzig'), 'Leipzig');
  assert.equal(r('Paris Saint-Germain'), 'Paris');
  assert.equal(r('Inter Milan'), 'Inter');
  assert.equal(r('Lillestrom'), 'Lillestrøm');
  assert.equal(r('Bayern Munchen'), 'Bayern München');
  assert.equal(r('Real'), null, 'two clubs start with Real');
  assert.equal(r('Manchester'), null);
  assert.equal(r('Sheffield'), null);
  assert.equal(r('Man'), null, 'too short to guess');
});
