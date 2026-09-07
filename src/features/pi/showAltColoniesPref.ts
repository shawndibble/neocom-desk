/**
 * Device-local: should the Colonies list append the other authenticated
 * Characters' cached colonies below the active one's?
 *
 * Distinct from `altColoniesPref.ts`, which asks the *Advisor* whether it may
 * plan across those colonies. Same word, two questions — *show me* versus
 * *plan with* — and sharing one key would couple two tabs through the route:
 * turning on a wider view to see where an alt's Broadcast Nodes sit would
 * quietly widen the Advisor's routing assumptions too. Two keys keep each
 * control answering only for itself.
 *
 * Off by default, matching the Advisor's own default and the behaviour before
 * this was persisted.
 *
 * Free to remember: the alt roster (`roster.ts`) is loaded unconditionally by
 * `loadPiSnapshot` and is cache-only, so restoring "on" spends no extra ESI
 * request — it only decides whether rows already in memory are rendered.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const PI_COLONIES_SHOW_ALTS_KEY = 'piColoniesShowAlts';

export const DEFAULT_PI_COLONIES_SHOW_ALTS = false;

export const useShowAltColonies = createLocalSetting<boolean>({
  key: PI_COLONIES_SHOW_ALTS_KEY,
  defaultValue: DEFAULT_PI_COLONIES_SHOW_ALTS,
});
