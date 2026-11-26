import { createLocalSetting } from '@/lib/useLocalSetting';

export const INSTALL_PROMPT_SEEN_KEY = 'installPrompt.seen';

export const useInstallPromptSeen = createLocalSetting<boolean>({
  key: INSTALL_PROMPT_SEEN_KEY,
  defaultValue: false,
  parse: (raw) => (typeof raw === 'boolean' ? raw : null),
});

export const INSTALL_PROMPT_PAGE_VISITS_KEY = 'installPrompt.pageVisits';

export const INSTALL_PROMPT_MIN_PAGE_VISITS = 5;

export const useInstallPromptPageVisits = createLocalSetting<number>({
  key: INSTALL_PROMPT_PAGE_VISITS_KEY,
  defaultValue: 0,
  parse: (raw) => (typeof raw === 'number' && raw >= 0 ? raw : null),
});

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallPlatform = 'ios-safari' | 'ios-other' | 'android-firefox' | 'android';

export function detectInstallPlatform(
  userAgent: string,
  maxTouchPoints: number
): InstallPlatform | null {
  const isIOS =
    /iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && maxTouchPoints > 1);
  if (isIOS) return /crios|fxios|edgios|opios/i.test(userAgent) ? 'ios-other' : 'ios-safari';
  if (/android/i.test(userAgent)) return /firefox/i.test(userAgent) ? 'android-firefox' : 'android';
  return null;
}

export type InstallPromptVariant = 'none' | 'native' | Exclude<InstallPlatform, 'android'>;

export function selectInstallPromptVariant(state: {
  seen: boolean;
  isStandalone: boolean;
  deferredPromptAvailable: boolean;
  platform: InstallPlatform | null;
  pageVisits: number;
}): InstallPromptVariant {
  if (state.seen || state.isStandalone || state.platform === null) return 'none';
  if (state.pageVisits < INSTALL_PROMPT_MIN_PAGE_VISITS) return 'none';
  if (state.deferredPromptAvailable) return 'native';
  return state.platform === 'android' ? 'none' : state.platform;
}

export type InstallAppVariant =
  'none' | 'installed' | 'native' | 'menu' | Exclude<InstallPlatform, 'android'>;

export function selectInstallAppVariant(state: {
  isStandalone: boolean;
  deferredPromptAvailable: boolean;
  platform: InstallPlatform | null;
}): InstallAppVariant {
  if (state.platform === null) return 'none';
  if (state.isStandalone) return 'installed';
  if (state.deferredPromptAvailable) return 'native';
  if (state.platform === 'android') return 'menu';
  return state.platform;
}
