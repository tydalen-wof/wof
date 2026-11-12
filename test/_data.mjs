// Shared by the English and Welsh page tests: one data set, so the two pages can be compared.
import { fixtureKey } from '../scripts/render.mjs';

export const fx = (date, time, home, away, venue, o = {}) => ({ date, time, home, away, venue, competition: 'X', tag: null, status: 'scheduled', sources: ['S'], ...o });
export const sec = (key, group, name, layout, followed, fixtures, o = {}) => ({ key, group, name, layout, followed, fixtures, sources: [], conflicts: [], notes: [], postponementCheck: `${name}: checked.`, ...o });
// The build decides each postcode; the page only shows what it is given.
export const pcs = (list, text) => Object.fromEntries(list.map(f => [fixtureKey(f), text]));

const cymru = [
  fx('2026-11-21', '14:00', 'Holyhead Hotspur', 'Bala Town', 'The New Oval'),
  fx('2026-11-21', '14:00', 'Brickfield Rangers', 'Newtown', 'Clywedog Park'),
  fx('2026-11-14', '14:00', 'Bala Town', 'Holyhead Hotspur', null),
  fx('2026-11-14', '14:00', 'Followed No Postcode', 'Rhyl 1879', 'Some Ground'),
  fx('2026-11-14', '14:00', 'Llanuwchllyn', 'Rhyl 1879', null),
];
const welsh = [
  fx('2026-11-14', '14:00', 'Caerau Ely', 'Brickfield Rangers', null, { tag: 'Welsh Cup' }),
  fx('2026-11-14', '14:00', 'Holyhead Hotspur', 'Blaen-y-Maes', 'The New Oval', { tag: 'Welsh Cup' }),
  fx('2026-11-14', '14:00', 'Newtown', 'Caerphilly Athletic', null, { tag: 'Welsh Cup' }),
];
const trophy = [
  fx('2026-11-14', '15:00', 'Hebburn Town', 'Guiseley AFC', null, { tag: 'Second Round Proper' }),
  fx('2026-11-14', '15:00', 'Holyhead Hotspur', 'Chorley', null, { tag: 'Second Round Proper' }),   // a name that has a postcode elsewhere: only the build's map decides
  fx('2026-11-14', '15:00', 'Bath City', 'Truro City', 'Twerton Park', { tag: 'FA Trophy' }),
];

export const DATA = {
  checkedAt: '2026-11-12 05:30 GMT',
  window: { start: '2026-11-12', end: '2026-11-22' },
  notes: [],
  hidden: ['Championship', 'UEFA Europa League'],
  groupLogos: {
    International: { src: 'assets/logos/group-international.svg' },
    English: { src: 'assets/logos/group-english.png', chip: 'purple' },
    'European clubs': { src: 'assets/logos/group-european-clubs.svg', chip: 'navy', crop: 'ball' },
  },
  sections: [
    sec('wales', 'International', "Wales men's internationals", 'plain', ['Wales'], [
      fx('2026-11-14', '17:00', 'Norway', 'Wales', 'Ullevaal Stadion, Oslo', { tag: 'Nations League · Group A4' }),
      fx('2026-11-17', '19:45', 'Wales', 'Portugal', 'Cardiff City Stadium', { tag: 'Nations League · Group A4' }),
    ], { logo: 'assets/logos/wales.svg', logoChip: 'dark' }),
    sec('internationals', 'International', 'Other UK and European internationals', 'days', ['England', 'Scotland'], [
      fx('2026-11-13', '19:45', 'Scotland', 'North Macedonia', 'Hampden Park, Glasgow', { tag: 'Nations League · Group B1' }),
      fx('2026-11-12', '19:45', 'England', 'Croatia', 'Wembley Stadium, London', { tag: 'Nations League · Group A3' }),
      fx('2026-11-14', '19:45', 'Austria', 'Republic of Ireland', 'Raiffeisen Arena, Linz', { tag: 'Nations League · Group B3' }),
      fx('2026-11-15', '19:45', 'Spain', 'England', 'Metropolitano, Madrid', { tag: 'Nations League · Group A3' }),
      fx('2026-11-14', '17:00', 'France', 'Turkey', null, { tag: 'Friendly' }),
    ]),
    sec('cymru-north', 'Welsh', 'Novira Cymru North', 'rows', ['Holyhead Hotspur', 'Brickfield Rangers', 'Followed No Postcode'], cymru, {
      postcodes: { ...pcs([cymru[0]], 'LL65 2YE'), ...pcs([cymru[1]], 'LL14 4HE'), ...pcs([cymru[3]], 'Postcode not found') },
      conflicts: [{ kind: 'kick-off time', text: 'A free-text conflict about Cymru North.' }],
    }),
    sec('welsh-cup', 'Welsh', 'FAW Welsh Cup', 'rows', ['Holyhead Hotspur', 'Brickfield Rangers'], welsh, { postcodes: pcs([welsh[1]], 'LL65 2YE') }),
    sec('premier-league', 'English', 'Premier League', 'rows', ['Leeds United', 'Manchester United', 'Liverpool'], [
      fx('2026-11-22', '16:30', 'Liverpool', 'Manchester United', 'Anfield'),
      fx('2026-11-21', '12:30', 'Manchester City', 'Fulham', 'Etihad Stadium'),
      fx('2026-11-21', '15:00', 'Chelsea', 'Leeds United', 'Stamford Bridge'),
      fx('2026-11-21', '15:00', 'Aston Villa', 'Sunderland', 'Villa Park'),
    ], {
      logo: 'assets/logos/premier-league.png', notes: ['A free-text note about the Premier League.'],
      sources: [
        { name: 'Premier League (official feed)', ok: true, role: 'base' },
        { name: 'Sky Sports', ok: true, role: 'check' },
        { name: 'ESPN', ok: false, error: 'HTTP 403', role: 'check' },
      ],
    }),
    sec('championship', 'English', 'Championship', 'rows', ['Wrexham'], [fx('2026-11-21', '15:00', 'Lincoln City', 'Wrexham', 'LNER Stadium')], { hidden: true, notes: ['hidden-section note'], conflicts: [{ kind: 'time', text: 'hidden-section conflict' }] }),
    sec('league-one', 'English', 'League One', 'rows', ['Plymouth Argyle', 'MK Dons'], [
      fx('2026-11-21', '15:00', 'Mansfield Town', 'MK Dons', 'One Call Stadium'),
      fx('2026-11-14', '15:00', 'Sheffield Wednesday', 'Plymouth Argyle', 'Hillsborough Stadium'),
      fx('2026-11-14', '15:00', 'Bromley', 'Notts County', 'Hayes Lane', { status: 'postponed' }),
      fx('2026-11-20', null, 'Barnsley', 'Sheffield Wednesday', null),
    ]),
    sec('southern-premier-south', 'English', 'Southern League Premier South', 'rows', ['Plymouth Parkway'], [
      fx('2026-11-14', '15:00', 'Hanwell Town', 'Plymouth Parkway', 'Oliver Connell and Sons Community Stadium'),
      fx('2026-11-21', '15:00', 'Plymouth Parkway', 'Malvern Town', 'Bolitho Park'),
    ], { postcodes: { '2026-11-21|Plymouth Parkway|Malvern Town': 'TE5 7ST' } }),
    sec('fa-cup', 'English', 'FA Cup', 'rows', ['Leeds United', 'Plymouth Parkway'], [], { unavailable: true }),
    sec('fa-trophy', 'English', 'FA Trophy', 'rows', ['Plymouth Parkway'], trophy, { postcodes: pcs([trophy[2]], 'TE5 7ST') }),
    sec('champions-league', 'European clubs', 'UEFA Champions League', 'rows', ['Liverpool', 'Manchester United'], [
      fx('2026-11-25', '20:00', 'Club Brugge', 'Liverpool', 'Jan Breydelstadion, Bruges', { tag: 'League Phase · Matchday 5' }),
      fx('2026-11-25', '20:00', 'Leipzig', 'Lens', 'Red Bull Arena, Leipzig', { tag: 'League Phase · Matchday 5' }),
    ]),
    sec('europa-league', 'European clubs', 'UEFA Europa League', 'rows', ['Leeds United'], [fx('2026-11-26', '20:00', 'Celta', 'Bournemouth', null)], { hidden: true }),
  ],
};

