import { createLocalSetting } from '@/lib/useLocalSetting';

const FITTING_VIEW_SETTING_KEY = 'fittingsView';

export type FittingView = 'ring' | 'list';

export const useFittingViewPreference = createLocalSetting<FittingView | null>({
  key: FITTING_VIEW_SETTING_KEY,
  defaultValue: null,
  parse: (raw) => (raw === 'ring' || raw === 'list' ? raw : null),
});

export function resolveFittingView(stored: FittingView | null, isPhone: boolean): FittingView {
  return stored ?? (isPhone ? 'list' : 'ring');
}
