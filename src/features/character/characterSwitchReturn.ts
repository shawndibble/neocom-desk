/**
 * Where picking a Character on `/characters` sends the pilot: back to the page
 * the switch started from (#1764, #4691), so switching on Skills lands on the
 * new Character's Skills. Overview when there is nowhere to return to (a fresh
 * load) or the origin was `/characters` itself: there is nowhere to return to,
 * so `null`, and the pilot stays on Characters (picking a Character there is
 * not a request to leave).
 *
 * The origin is reopened under a different Character, so the parts of it that
 * name the previous Character's own things are dropped (#4691's audit):
 *
 * - `?char=` / `?chars=` holding a Character id (`viewedCharacter.ts`) would
 *   keep showing the previous pick's wallet, assets or orders. Assets'
 *   `current`/`all` filter keywords re-resolve, so they stay.
 * - An Assets drill-down (`/assets/items/<station>/<containers>`) is the
 *   previous Character's station and containers; it collapses to the Items tab.
 *
 * Industry plan and group pages (`/industry/plans/:planId`,
 * `/industry/groups/:groupId`) already redirect to their list when the id is
 * not the active Character's. A Skill Plan (`/skills/plans/:planId`) stays
 * open and is re-costed for the new Character. Every other query param is a
 * filter, sort, tab or a global id, so the rest of the origin is kept as is.
 */
import { VIEWED_CHARACTER_PARAM } from './viewedCharacter';

const ASSETS_ITEMS = '/assets/items';
const CHARACTER_ID_PARAMS = [VIEWED_CHARACTER_PARAM, 'chars'];

export function returnPathAfterSwitch(from: string | undefined): string | null {
  if (!from) return null;
  const url = new URL(from, 'http://origin.invalid');
  if (url.pathname === '/characters') return null;
  const pathname = url.pathname.startsWith(`${ASSETS_ITEMS}/`) ? ASSETS_ITEMS : url.pathname;
  for (const key of CHARACTER_ID_PARAMS) {
    if (/^\d+$/.test(url.searchParams.get(key) ?? '')) url.searchParams.delete(key);
  }
  return `${pathname}${url.search}${url.hash}`;
}
