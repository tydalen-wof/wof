import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferDate, parseSky } from '../scripts/collect/sky.mjs';
import { parseFaw, slugToName } from '../scripts/collect/faw.mjs';
import { parseFa, parseFaDate } from '../scripts/collect/fa.mjs';
import { parseBetDate, parseBetExplorer } from '../scripts/collect/betexplorer.mjs';
import { parseEasternDetail, parseEspn } from '../scripts/collect/espn.mjs';
import { parseParkway } from '../scripts/collect/parkway.mjs';
import { parseSouthern, parseTrophy, validateLeagueItems } from '../scripts/collect/southern-league.mjs';
import { parseUefa } from '../scripts/collect/uefa.mjs';
import { makeFixture } from '../scripts/lib/fixture.mjs';

test('Sky: year is inferred from the weekday', () => {
  assert.equal(inferDate('Saturday 21st November', '2026-11-12'), '2026-11-21');
  assert.equal(inferDate('Friday 6th November', '2026-11-12'), '2026-11-06');
  assert.equal(inferDate('Saturday 7th November', '2026-11-12'), '2026-11-07');
  assert.equal(inferDate('Sunday 3rd January', '2026-12-30'), '2027-01-03');
  assert.equal(inferDate('nonsense', '2026-11-12'), null);
});

test('Sky: reads the embedded match JSON, UK time and postponement flag', () => {
  const state = (o) => `data-state="${JSON.stringify(o).replace(/"/g, '&quot;')}"`;
  const m = (home, away, time, extra = {}) => ({ start: { date: 'Saturday 21st November', time }, teams: { home: { name: { full: home } }, away: { name: { full: away } } }, isPostponed: false, ...extra });
  const html = `<li ${state(m('Chelsea', 'Leeds United', '15:00'))}></li><li ${state(m('Arsenal', 'Spurs', '17:30', { isPostponed: true }))}></li>`;
  const { fixtures, covers } = parseSky(html, 'Premier League', '2026-11-12');
  assert.equal(fixtures.length, 2);
  assert.equal(fixtures[0].date, '2026-11-21');
  assert.equal(fixtures[0].time, '15:00');
  assert.equal(fixtures[1].status, 'postponed');
  assert.deepEqual([...covers], ['2026-11-21']);
});

test('FAW: names come from the match URL slug, kick-off from the UTC timestamp', () => {
  const card = (id, ms, slug) => `<div class="is-style-match-card-v2" data-match-id="${id}" data-match-kickoff-utc="${ms}"><a class="match-link" href="https://faw.cymru/cymru-leagues/match/${slug}/"></a><p class="home-name">Home</p></div>`;
  const html = card(1, Date.UTC(2026, 10, 21, 14, 0), 'holyhead-hotspur-fc-vs-bala-town-fc-novira-cymru-north-26-27')
    + card(2, Date.UTC(2026, 10, 14, 14, 0), 'cpd-llanuwchllyn-vs-cpd-y-rhyl-1879-fc-novira-cymru-north-26-27-2')
    + card(3, Date.UTC(2026, 10, 21, 14, 0), 'guilsfield-fc-vs-clwb-pel-droed-dinas-bangor-city-1876-football-club-novira-cymru-north-26-27');
  const cards = parseFaw(html, 'novira-cymru-north');
  assert.deepEqual(cards.map(c => [c.home, c.away]), [['Holyhead Hotspur', 'Bala Town'], ['Llanuwchllyn', 'Rhyl 1879'], ['Guilsfield', 'Bangor City 1876']]);
  assert.equal(slugToName('newtown-afc'), 'Newtown');
  assert.equal(slugToName('brickfield-rangers-fc'), 'Brickfield Rangers');
});

test('BetExplorer: CET to UK across the autumn changeover', () => {
  assert.deepEqual(parseBetDate('17.11. 20:45', '2026-11-12'), { date: '2026-11-17', time: '20:45' });
  assert.deepEqual(parseBetDate('12.01.2027 20:45', '2026-11-12'), { date: '2027-01-12', time: '20:45' });
  assert.deepEqual(parseBetDate('05.01. 20:45', '2026-11-12'), { date: '2027-01-05', time: '20:45' });   // no year: next occurrence
  const row = (dt, a, b) => `<tr><td class="table-main__datetime">${dt}</td><td><a class="in-match"><span>${a}</span> - <span>${b}</span></a></td></tr>`;
  const html = row('24.10. 20:45', 'Poole', 'Wimborne') + row('25.10. 20:45', 'Frome', 'Bath') + row('&nbsp;', 'Havant &amp; W', 'Yate Town');
  const { fixtures, undated } = parseBetExplorer(html, '2026-10-20');
  assert.deepEqual(fixtures.map(f => [f.date, f.time]), [['2026-10-24', '19:45'], ['2026-10-25', '19:45']]);   // CEST->BST, then CET->GMT
  assert.equal(undated, 1);
});

test('ESPN: Eastern detail text converts to UK time', () => {
  assert.deepEqual(parseEasternDetail('Sat, November 14th at 12:00 pm GMT-05:00', '2026'), { date: '2026-11-14', time: '17:00' });
  assert.deepEqual(parseEasternDetail('Sun, March 8th at 12:00 am GMT-05:00', '2026'), { date: '2026-03-08', time: '05:00' });
  assert.deepEqual(parseEasternDetail('Mon, March 9th at 12:00 pm GMT-04:00', '2026'), { date: '2026-03-09', time: '16:00' });
  assert.equal(parseEasternDetail('Postponed', '2026'), null);
});

test('ESPN: prefers the UTC instant, falls back to Eastern text, reports only fully shown days as covered', () => {
  const ev = (o) => ({ competitors: [{ isHome: true, displayName: o.home }, { isHome: false, displayName: o.away }], venue: { fullName: 'Somewhere' }, status: { state: 'pre', detail: o.detail }, ...o.extra });
  const days = {
    20261114: [ev({ home: 'Norway', away: 'Wales', detail: 'Sat, November 14th at 12:00 pm GMT-05:00', extra: { date: '2026-11-14T17:00Z' } }),
               ev({ home: 'Ukraine', away: 'Georgia', detail: 'Sat, November 14th at 3:00 pm GMT-05:00' })],
    20261115: [ev({ home: 'Spain', away: 'England', detail: 'x', extra: { date: '2026-11-16T00:30Z' } })],   // UK date differs from the page's day key
  };
  const html = `<script>window['__espnfitt__']=${JSON.stringify({ page: { content: { events: days } } })};</script>`;
  const { fixtures, covers } = parseEspn(html);
  assert.deepEqual(fixtures.map(f => [f.date, f.time]), [['2026-11-14', '17:00'], ['2026-11-14', '20:00'], ['2026-11-16', '00:30']]);
  assert.deepEqual([...covers], ['2026-11-14']);
});

test('Parkway: reads rows, ignores N/A venues, flags postponements, separates cup ties', () => {
  const row = (dt, title, league, shown, venue) => `<tr class="sp-row sp-post"><td><time datetime="${dt}" class="sp-event-date"></time><h5 class="sp-event-results"><a>${shown}</a></h5><div class="sp-event-league">${league}</div><div class="sp-event-venue"><div itemprop="address" itemscope itemtype="http://schema.org/PostalAddress">${venue}</div></div><h4 class="sp-event-title"><a href="x">${title}</a></h4></td></tr>`;
  const html = row('2026-11-14 15:00:10', 'Hanwell Town v Plymouth Parkway', 'Southern League Premier South', '3:00 pm', 'The Powerday Stadium')
    + row('2026-11-21 15:00:33', 'Plymouth Parkway v Malvern Town', 'Southern League Premier South', 'Postponed', 'N/A')
    + row('2026-11-28 15:00:00', 'Plymouth Parkway v Someone', 'FA Cup', '3:00 pm', 'Bolitho Park');
  const rows = parseParkway(html);
  assert.equal(rows.length, 3);
  assert.deepEqual([rows[0].date, rows[0].time, rows[0].venue, rows[0].postponed], ['2026-11-14', '15:00', 'The Powerday Stadium', false]);
  assert.equal(rows[1].postponed, true);
  assert.equal(rows[1].venue, null);
  assert.equal(rows[2].league, 'FA Cup');
});

test('UEFA: senior men only, UTC to UK time, Nations League group tag, city added to the venue unless the name already has it', () => {
  const team = (name, type = 'NATIONAL_MEN_TEAM_A') => ({ internationalName: name, teamTypeDetail: type });
  const m = (o) => ({ homeTeam: team('Wales'), awayTeam: team('Portugal'), kickOffTime: { dateTime: '2026-11-17T19:45:00Z' }, status: 'UPCOMING',
    competition: { code: 'UNL', metaData: { name: 'UEFA Nations League' } }, group: { metaData: { groupName: 'Group A4' } },
    stadium: { translations: { name: { EN: 'Principality Stadium' } }, city: { translations: { name: { EN: 'Cardiff' } } } }, ...o });
  const { fixtures, teams } = parseUefa([m({}), m({ awayTeam: team('Portugal U21', 'NATIONAL_MEN_TEAM_U21') }), m({ competition: { code: 'A Int.', metaData: { name: 'Friendly Matches' } }, group: null, kickOffTime: { dateTime: '2026-06-02T18:00:00Z' } })]);
  assert.equal(fixtures.length, 2);
  assert.deepEqual([fixtures[0].tag, fixtures[0].venue], ['Nations League · Group A4', 'Principality Stadium, Cardiff']);
  assert.deepEqual([fixtures[1].tag, fixtures[1].time], ['Friendly', '19:00'], 'June kick-off 18:00 UTC is 19:00 BST');
  assert.ok(teams.includes('Wales'));
});

test('fixture shape: unknown times and venues stay null, never guessed', () => {
  const f = makeFixture({ date: '2026-11-21', time: 'TBC', home: 'A', away: 'B', venue: 'TBC', competition: 'X', source: 'S' });
  assert.deepEqual(Object.keys(f).sort(), ['away', 'competition', 'date', 'home', 'sources', 'status', 'tag', 'time', 'venue']);
  assert.equal(f.time, null);
  assert.equal(f.venue, null);
  assert.equal(f.status, 'scheduled');
});

test('Southern League feed: refuses partial, wrong-competition or inconsistent data, and de-duplicates pages', () => {
  const row = (o) => ({ id: o.id, competition: { name: 'Premier South' }, homeTeam: { fullName: 'Bath City' }, awayTeam: { fullName: 'Berkhamsted' }, dateTime: '2026-11-14T15:00:00.000Z', date: '2026-11-14', time: '15:00', status: 'NotKickedOff', ...o });
  assert.equal(validateLeagueItems([row({ id: 1 }), row({ id: 2 }), row({ id: 2 })], 3).length, 2, 'a match repeated across pages counts once');
  assert.throws(() => validateLeagueItems([row({ id: 1 })], 2), /refusing partial/);
  assert.throws(() => validateLeagueItems([row({ id: 1, competition: { name: 'Premier Central' } })], 1), /unexpected competition/);
  assert.throws(() => validateLeagueItems([row({ id: 1, date: '2026-11-15' })], 1), /date mismatch/);
  assert.throws(() => validateLeagueItems([row({ id: 1, homeTeam: {} })], 1), /missing team/);
  assert.throws(() => validateLeagueItems([], 0), /no fixtures/);
});

test('Southern League feed: league rows keep their kick-off times, venues, postponements and summer dates', () => {
  const PS = '69d0bd99b616bafb97331d3f';
  const item = (o) => ({ competition: { id: PS, type: 'league', name: 'Premier South' }, date: '2026-11-14', time: '15:00', dateTime: '2026-11-14T15:00:00.000Z', status: 'NotKickedOff', venue: 'Ground', homeTeamName: 'A Town', awayTeamName: 'B Town', ...o });
  const items = [
    item({ homeTeamName: 'Bath City', awayTeamName: 'Berkhamsted', status: 'Postponed', venue: null, homeTeam: { club: { stadiumName: 'Twerton Park' } } }),
    item({ homeTeamName: 'Frome Town', awayTeamName: 'Poole Town', venue: 'N/A', time: '19:45' }),
    item({ homeTeamName: 'Central A', awayTeamName: 'Central B', competition: { id: 'other', type: 'league', name: 'Premier Central' } }),
    item({ homeTeamName: 'Poole Town', awayTeamName: 'Uxbridge', competition: { id: 'cup', type: 'cup', name: 'FA Trophy' } }),
    item({ homeTeamName: 'Gosport Borough', awayTeamName: 'Chertsey Town', dateTime: '2026-07-04T15:00:00.000Z', date: '2026-07-04' }),
  ];
  const r = parseSouthern(items);
  assert.deepEqual(r.fixtures.map(f => [f.home, f.time, f.status, f.venue, f.tag]), [
    ['Bath City', '15:00', 'postponed', 'Twerton Park', null],
    ['Frome Town', '19:45', 'scheduled', null, null],
    ['Gosport Borough', '15:00', 'scheduled', 'Ground', null],
  ]);
  assert.equal(r.fixtures[2].date, '2026-07-04', 'summer dates use the displayed date and time, not the fake-Z timestamp');
  assert.equal(r.unknownStatus.length, 0);
  assert.deepEqual(parseSouthern([item({ status: 'Abandoned' })]).unknownStatus, ['Abandoned (A Town v B Town)']);
});

test('Southern League feed: FA Trophy ties are taken from cup rows only, with their times and venues', () => {
  const row = (o) => ({ competition: { id: 'c1', type: 'cup', name: 'FA Trophy', shortName: 'FA Trophy' }, date: '2026-11-14', time: '15:00', status: 'NotKickedOff', venue: 'Wyatt Homes Stadium', homeTeamName: 'Wimborne Town', awayTeamName: 'Uxbridge', ...o });
  const r = parseTrophy([row({}), row({ homeTeamName: 'X', awayTeamName: 'Y', competition: { id: 'c2', type: 'cup', name: 'Hampshire Senior Cup' } }), row({ competition: { id: 'p', type: 'league', name: 'Premier South' } })]);
  assert.equal(r.fixtures.length, 1);
  assert.deepEqual([r.fixtures[0].time, r.fixtures[0].venue, r.fixtures[0].tag, r.fixtures[0].competition], ['15:00', 'Wyatt Homes Stadium', 'FA Trophy', 'FA Trophy']);
});

test('FA site: reads each match day table, the round, times written with a stray ">", and tidies names', () => {
  const tie = (time, n, home, away, extra = '') => `<tr class="even"><td class="cOne first"><time datetime=">${time}">${time}</time></td><td class="cTwo">${n}</td><td class="cThree"><a href="http://x" title="Buy Tickets">${home}</a></td><td class="cFour">VS</td><td class="cFive"><a href="http://y">${away}</a></td><td class="cSix">${extra}</td><td class="cSeven last"></td></tr>`;
  const table = (date, round, rows) => `<table class="gTable"><tr><td colspan="4" class="headl">${date}</td><td colspan="3" class="headr">${round}</td></tr><tr><th class="cOne first">Kick Off</th></tr>${rows}</table>`;
  const html = table('Saturday 14 November 2026', 'Second Round Proper', tie('15:00', 1, 'Hebburn Town', 'Guiseley AFC') + tie('15:00', 2, 'Darlington_', 'Bury') + tie('17:30', 3, 'Wingate &amp; Finchley', 'Hashtag United', 'Postponed'))
    + table('Sunday 15 November 2026', 'Second Round Proper', tie('TBC', 4, 'A Town', 'B Town'));
  const { fixtures, teams } = parseFa(html, 'FA Trophy');
  assert.deepEqual(fixtures.map(f => [f.date, f.time, f.home, f.away, f.tag, f.status]), [
    ['2026-11-14', '15:00', 'Hebburn Town', 'Guiseley AFC', 'Second Round Proper', 'scheduled'],
    ['2026-11-14', '15:00', 'Darlington', 'Bury', 'Second Round Proper', 'scheduled'],
    ['2026-11-14', '17:30', 'Wingate & Finchley', 'Hashtag United', 'Second Round Proper', 'postponed'],
    ['2026-11-15', null, 'A Town', 'B Town', 'Second Round Proper', 'scheduled'],
  ]);
  assert.ok(teams.includes('Darlington'));
  assert.equal(parseFaDate('Saturday 5 December 2026'), '2026-12-05');
  assert.equal(parseFaDate('nonsense'), null);
});

test('Welsh Cup: reads the FAW slugs, applying the built-in and configured name overrides', () => {
  const card = (id, ms, slug) => `<div data-match-id="${id}" data-match-kickoff-utc="${ms}"><a class="match-link" href="https://faw.cymru/cymru-leagues/match/${slug}/"></a></div>`;
  const html = card(1, Date.UTC(2026, 10, 13, 19, 45), 'connahs-quay-nomads-fc-vs-mochdre-sports-fc-faw-welsh-cup-26-27-knockout-rounds')
    + card(2, Date.UTC(2026, 10, 14, 15, 0), 'cardiff-met-fc-vs-dolgellau-aa-fc-faw-welsh-cup-26-27-knockout-rounds')
    + card(3, Date.UTC(2026, 10, 14, 14, 0), 'holyhead-hotspur-fc-vs-some-new-club-fc-faw-welsh-cup-26-27-knockout-rounds')
    + '<div data-match-id="9" data-match-kickoff-utc="1"><p>template with no match link</p></div>';
  const cards = parseFaw(html, 'faw-welsh-cup', { 'some-new-club-fc': 'Some New Club AFC' });
  assert.deepEqual(cards.map(c => [c.home, c.away]), [["Connah's Quay Nomads", 'Mochdre Sports'], ['Cardiff Met', 'Dolgellau AA'], ['Holyhead Hotspur', 'Some New Club AFC']]);
  assert.deepEqual(parseFaw(html, 'novira-cymru-north'), [], 'a Welsh Cup slug is not read as a Cymru North match');
});
