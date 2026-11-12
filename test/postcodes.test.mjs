import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalisePostcode, emptyLookup, loadLookup, saveLookup, makeFinder, addEntry, applyLookup, mergeAdditions, NOT_FOUND } from '../scripts/lib/postcodes.mjs';
import { main } from '../scripts/postcodes.mjs';

const fx = (home, away, o = {}) => ({ date: '2026-11-21', time: '15:00', home, away, venue: null, competition: 'X', tag: null, status: 'scheduled', sources: ['S'], ...o });
const lookupOf = teams => ({ _comment: 'c', teams });
const key = f => `${f.date}|${f.home}|${f.away}`;

test('postcodes are validated and normalised, never guessed', () => {
  assert.equal(normalisePostcode('ll65 2ye'), 'LL65 2YE');
  assert.equal(normalisePostcode('LL652YE'), 'LL65 2YE');
  assert.equal(normalisePostcode(' bs1  4dj '), 'BS1 4DJ');
  assert.equal(normalisePostcode('M1 1AE'), 'M1 1AE');
  assert.equal(normalisePostcode('EC1A 1BB'), 'EC1A 1BB');
  for (const bad of ['', null, 'NOT A PC', 'LL65', '12345', 'LL65 2Y', 'LL65 2YEE']) assert.equal(normalisePostcode(bad), null, String(bad));
});

test('a known postcode is shown on that team\'s home games only, using exact or alias names', () => {
  const lookup = lookupOf({ 'Holyhead Hotspur': { venue: 'The New Oval', postcode: 'LL65 2YE' }, 'MK Dons': { venue: 'Stadium MK', postcode: 'MK1 1ST' } });
  const finder = makeFinder(lookup, { 'milton keynes dons': 'MK Dons' });
  const fixtures = [fx('Holyhead Hotspur', 'Bala Town'), fx('Bala Town', 'Holyhead Hotspur'), fx('Milton Keynes Dons', 'Reading'), fx('Holyhead', 'Rhyl 1879')];
  const r = applyLookup({ fixtures, finder, show: true });
  assert.deepEqual(r.postcodes, { [key(fixtures[0])]: 'LL65 2YE', [key(fixtures[2])]: 'MK1 1ST' }, 'home games only; an alias matches; a prefix does not');
});

test('a followed club\'s home game says "Postcode not found" when none is stored, but other clubs show nothing', () => {
  const finder = makeFinder(lookupOf({ 'Plymouth Parkway': { venue: 'Bolitho Park', postcode: null } }), {});
  const fixtures = [fx('Plymouth Parkway', 'Malvern Town'), fx('Hanwell Town', 'Plymouth Parkway'), fx('Frome Town', 'Bath City')];
  const r = applyLookup({ fixtures, followed: ['Plymouth Parkway'], finder, show: true, nonLeague: true });
  assert.deepEqual(r.postcodes, { [key(fixtures[0])]: NOT_FOUND });
  assert.deepEqual(r.missing, ['Frome Town', 'Hanwell Town', 'Plymouth Parkway']);
});

test('in a mixed section (FA Cup) "not found" appears only for a followed club already known as non-league', () => {
  const finder = makeFinder(lookupOf({ 'Plymouth Parkway': { venue: null, postcode: null } }), {});
  const fixtures = [fx('Plymouth Parkway', 'Barnet'), fx('Crewe Alexandra', 'Plymouth Argyle'), fx('Leeds United', 'Notts County')];
  const r = applyLookup({ fixtures, followed: ['Plymouth Parkway', 'Plymouth Argyle', 'Leeds United'], finder, show: true, nonLeague: false });
  assert.deepEqual(Object.values(r.postcodes), [NOT_FOUND], 'a league club (Leeds United) gets no "not found"');
  assert.equal(r.missing.length, 0, 'the to-do list is only built for non-league sections');
});

test('a missing venue is filled from the stored ground; a feed venue is never overwritten', () => {
  const finder = makeFinder(lookupOf({ 'Holyhead Hotspur': { venue: 'The New Oval', postcode: 'LL65 2YE' } }), {});
  const r = applyLookup({ fixtures: [fx('Holyhead Hotspur', 'Bala Town'), fx('Holyhead Hotspur', 'Rhyl 1879', { venue: 'The New Oval' })], finder, show: true, cup: true });
  assert.deepEqual(r.fixtures.map(f => f.venue), ['The New Oval', 'The New Oval']);
  assert.ok(r.notes.some(n => /1 venue\(s\) come from the stored home grounds/.test(n)), 'cup ties say the ground may differ');
});

test('if a feed names a different ground, the stored postcode is withheld and the reason given', () => {
  const finder = makeFinder(lookupOf({ 'Plymouth Parkway': { venue: 'Bolitho Park', postcode: 'PL5 3AA' } }), {});
  const f = fx('Plymouth Parkway', 'Berkhamsted', { venue: 'Manadon Sports Hub' });
  const r = applyLookup({ fixtures: [f], finder, show: true });
  assert.deepEqual(r.postcodes, {});
  assert.equal(r.fixtures[0].venue, 'Manadon Sports Hub');
  assert.ok(r.notes.some(n => /"Manadon Sports Hub" but the stored ground for Plymouth Parkway is "Bolitho Park"/.test(n)));
  // A differently worded name for the same ground still matches.
  assert.deepEqual(applyLookup({ fixtures: [fx('Plymouth Parkway', 'X', { venue: 'Bolitho Park Stadium' })], finder, show: true }).postcodes, { '2026-11-21|Plymouth Parkway|X': 'PL5 3AA' });
});

test('a stored caveat is reported only when its postcode is actually shown', () => {
  const finder = makeFinder(lookupOf({ 'Holyhead Hotspur': { venue: 'The New Oval', postcode: 'LL65 2YE', caveat: 'less certain' } }), {});
  assert.deepEqual(applyLookup({ fixtures: [fx('Holyhead Hotspur', 'Bala Town')], finder, show: true }).notes, ['less certain']);
  assert.deepEqual(applyLookup({ fixtures: [fx('Bala Town', 'Holyhead Hotspur')], finder, show: true }).notes, []);
});

test('unseen home teams are recorded (venue only for league grounds) and stored values are never overwritten', () => {
  const lookup = lookupOf({ 'Bath City': { venue: null, postcode: null }, 'Holyhead Hotspur': { venue: 'The New Oval', postcode: 'LL65 2YE' } });
  const finder = makeFinder(lookup, {});
  const fixtures = [fx('Bath City', 'Berkhamsted', { venue: 'Twerton Park' }), fx('Frome Town', 'Poole Town', { venue: 'Badgers Hill' }), fx('Holyhead Hotspur', 'X', { venue: 'Elsewhere' })];
  const league = applyLookup({ fixtures, finder, show: true, record: true, recordVenue: true });
  assert.deepEqual(league.additions, [{ team: 'Frome Town', venue: 'Badgers Hill' }]);
  assert.deepEqual(league.venueFills, [['Bath City', 'Twerton Park']]);
  const cup = applyLookup({ fixtures, finder, show: true, record: true, recordVenue: false });
  assert.deepEqual(cup.additions, [{ team: 'Frome Town', venue: null }], 'a cup venue is not stored as the club\'s ground');
  assert.deepEqual(cup.venueFills, []);

  const changed = mergeAdditions(lookup, league, '2026-11-12');
  assert.equal(changed, 2);
  assert.deepEqual(lookup.teams['Frome Town'], { venue: 'Badgers Hill', postcode: null, source: 'seen in a fixture feed', added: '2026-11-12' });
  assert.equal(lookup.teams['Bath City'].venue, 'Twerton Park');
  assert.equal(lookup.teams['Holyhead Hotspur'].venue, 'The New Oval', 'a stored ground is not replaced');
  assert.equal(mergeAdditions(lookup, league, '2026-11-13'), 0, 'running again changes nothing');
});

test('addEntry stores a discovered postcode, keeps what is already there, and refuses silent changes', () => {
  const lookup = lookupOf({ 'Bath City': { venue: 'Twerton Park', postcode: null, source: 'seen in a fixture feed', added: '2026-11-01' } });
  const e = addEntry(lookup, { team: 'Bath City', postcode: 'ba2 3dh', source: 'club website', note: 'check', today: '2026-11-12' });
  assert.deepEqual(e, { venue: 'Twerton Park', postcode: 'BA2 3DH', source: 'club website', added: '2026-11-12', caveat: 'check' });
  assert.throws(() => addEntry(lookup, { team: 'Bath City', postcode: 'BA2 9ZZ' }), /already has BA2 3DH/);
  assert.equal(addEntry(lookup, { team: 'Bath City', postcode: 'BA2 9ZZ', replace: true }).postcode, 'BA2 9ZZ');
  assert.throws(() => addEntry(lookup, { team: 'New Club', postcode: 'oops' }), /not a valid UK postcode/);
  assert.equal(lookup.teams['New Club'], undefined);
});

test('the file round-trips with sorted teams and a stable field order', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pc-'));
  const path = join(dir, 'postcodes.json');
  try {
    assert.deepEqual(loadLookup(path).teams, {}, 'a missing file is an empty lookup');
    const lookup = emptyLookup();
    lookup.teams['Zeta Town'] = { postcode: 'ZE1 1TA', venue: 'Z Park', added: '2026-11-12', source: 's' };
    lookup.teams['Alpha FC'] = { venue: null, postcode: null };
    saveLookup(lookup, path);
    const text = readFileSync(path, 'utf8');
    assert.ok(text.indexOf('Alpha FC') < text.indexOf('Zeta Town'), 'teams sorted');
    assert.ok(text.indexOf('"venue"') < text.indexOf('"postcode"') && text.indexOf('"postcode"') < text.indexOf('"source"'), 'fields in a fixed order');
    assert.ok(!existsSync(`${path}.tmp`), 'written atomically');
    assert.deepEqual(loadLookup(path).teams, lookup.teams);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the command line adds, lists and refuses', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pc-'));
  const path = join(dir, 'postcodes.json');
  const out = [];
  const run = args => main(args, { path, log: s => out.push(s) });
  try {
    run(['add', 'Holyhead Hotspur', 'll65 2ye', '--venue', 'The New Oval', '--source', 'club website']);
    assert.deepEqual(loadLookup(path).teams['Holyhead Hotspur'].postcode, 'LL65 2YE');
    assert.match(out.at(-1), /Holyhead Hotspur: LL65 2YE \(The New Oval\)/);
    const lookup = loadLookup(path); lookup.teams['Bath City'] = { venue: 'Twerton Park', postcode: null }; saveLookup(lookup, path);
    run(['missing']);
    assert.match(out.join('\n'), /Bath City \(Twerton Park\)/);
    assert.match(out.at(-1), /1 of 2 teams still need one/);
    assert.throws(() => run(['add', 'Holyhead Hotspur', 'LL65 2YF']), /Use --replace/);
    assert.throws(() => run(['add', 'Bath City', 'nope']), /not a valid UK postcode/);
    assert.throws(() => run(['add', 'Bath City']), /usage/);
    assert.throws(() => run(['frobnicate']), /commands/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
