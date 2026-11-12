import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldHide } from '../scripts/lib/visibility.mjs';

const fx = (home, away) => ({ date: '2026-11-21', time: '15:00', home, away });

test('a complete competition with no games is hidden', () => {
  assert.equal(shouldHide({ complete: true, fixtures: [], followed: ['Leeds United'] }), true);
});

test('a complete competition where none of the named teams plays is hidden, however many games it has', () => {
  assert.equal(shouldHide({ complete: true, fixtures: [fx('Arsenal', 'Chelsea'), fx('Spurs', 'Fulham')], followed: ['Leeds United', 'Liverpool'] }), true);
});

test('it is shown as soon as one named team is home or away', () => {
  assert.equal(shouldHide({ complete: true, fixtures: [fx('Arsenal', 'Chelsea'), fx('Fulham', 'Liverpool')], followed: ['Leeds United', 'Liverpool'] }), false);
  assert.equal(shouldHide({ complete: true, fixtures: [fx('Liverpool', 'Chelsea')], followed: ['Liverpool'] }), false);
});

test('names are compared the way the page compares them (spelling and case)', () => {
  assert.equal(shouldHide({ complete: true, fixtures: [fx('manchester united fc', 'Chelsea')], followed: ['Manchester United'] }), false);
});

test('an unreadable or incomplete list is never hidden: nobody can say that no named team is involved', () => {
  assert.equal(shouldHide({ unavailable: true, complete: false, fixtures: [], followed: ['Leeds United'] }), false);
  assert.equal(shouldHide({ unavailable: false, complete: false, fixtures: [fx('Arsenal', 'Chelsea')], followed: ['Leeds United'] }), false);
  assert.equal(shouldHide({ unavailable: false, complete: false, fixtures: [], followed: ['Leeds United'] }), false);
});

test('a competition with no named teams configured is shown whenever it has games', () => {
  assert.equal(shouldHide({ complete: true, fixtures: [fx('Arsenal', 'Chelsea')], followed: [] }), false);
  assert.equal(shouldHide({ complete: true, fixtures: [], followed: [] }), true);
});
