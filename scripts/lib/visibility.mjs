// When is a competition left off the page?
//   - Never when its source could not be read, or its list is known to be incomplete: we cannot say that nobody is
//     involved, so it is shown with a warning instead.
//   - Otherwise when it has no games at all, or none of its named (followed) teams plays in it.
//   - A competition with no named teams configured is never hidden for that reason (every game counts).
import { teamKey } from './teams.mjs';

export function shouldHide({ unavailable = false, complete = false, fixtures = [], followed = [] }) {
  if (unavailable || !complete) return false;
  if (!fixtures.length) return true;
  const keys = new Set(followed.map(teamKey));
  if (!keys.size) return false;
  return !fixtures.some(f => keys.has(teamKey(f.home)) || keys.has(teamKey(f.away)));
}
