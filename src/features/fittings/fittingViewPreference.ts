/**
 * Ring | List choice for the Fittings editor. Device-local and never in the
 * URL (`docs/context/decisions/20260922-221531-*`): it is a view preference,
 * not part of what a Share Link carries. `null` means "never chosen", so the
 * breakpoint decides — Ring on desktop, List on a phone.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const FITTING_VIEW_SETTING_KEY = 'fittingsView';

export type FittingView = 'ring' | 'list';

export const useFittingViewPreference = createLocalSetting<FittingView | null>({
  key: FITTING_VIEW_SETTING_KEY,
  defaultValue: null,
  parse: (raw) => (raw === 'ring' || raw === 'list' ? raw : null),
});

/** The view in effect: the stored choice, else the default for this breakpoint. */
export function resolveFittingView(stored: FittingView | null, isPhone: boolean): FittingView {
  return stored ?? (isPhone ? 'list' : 'ring');
}
