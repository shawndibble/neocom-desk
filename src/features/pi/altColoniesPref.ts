/**
 * Device-local: should the Advisor plan across every authenticated Character's
 * colonies, not just the active one?
 *
 * The Colonies panel already has its own "Show alt colonies" switch, but that
 * one is ephemeral `useState` on a different tab and answers a different
 * question — *show me* versus *plan with*. Sharing it would couple two tabs
 * through the route and lose the choice on every reload.
 *
 * Off by default. Alt colonies come from `roster.ts`, which is cache-only: a
 * Character whose colonies have never been loaded contributes nothing, and
 * silently planning around a partial picture is worse than not planning at all.
 * Turning it on is the pilot saying the alts are theirs to route between.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const PI_ALT_COLONIES_KEY = 'piAdvisorAltColonies';

export const DEFAULT_PI_ALT_COLONIES = false;

export const useAltColonies = createLocalSetting<boolean>({
  key: PI_ALT_COLONIES_KEY,
  defaultValue: DEFAULT_PI_ALT_COLONIES,
});
