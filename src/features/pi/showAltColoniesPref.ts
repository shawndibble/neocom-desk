/**
 * Device-local: should the Colonies list append the other authenticated
 * Characters' cached colonies below the active one's?
 *
 * Display only: no plan or advice reads it, so turning it on never widens what
 * Plan or Colonies assume they may route between.
 *
 * Off by default, matching the behaviour before this was persisted.
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
