/**
 * "Has this device already been offered install" — a plain (non-`sync.`) key:
 * device state, not Editable Data. Install-prompt permission is inherently
 * per-device (CONTEXT.md round 20).
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const INSTALL_PROMPT_SEEN_KEY = 'installPrompt.seen';

export const useInstallPromptSeen = createLocalSetting<boolean>({
  key: INSTALL_PROMPT_SEEN_KEY,
  defaultValue: false,
  parse: (raw) => (typeof raw === 'boolean' ? raw : null),
});

/** The native `beforeinstallprompt` event — not yet in lib.dom.d.ts. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Which phone/tablet install flow this browser has, or `null` on desktop —
 * the Install Prompt is mobile-only. iOS splits Safari from the other iOS
 * browsers (Chrome, Firefox, Edge… all WebKit underneath) because they put
 * "Add to Home Screen" behind different menus. iPadOS 13+ Safari sends a
 * Mac UA by default, so a "Macintosh" with touch points is an iPad.
 */
export type InstallPlatform = 'ios-safari' | 'ios-other' | 'android';

export function detectInstallPlatform(
  userAgent: string,
  maxTouchPoints: number
): InstallPlatform | null {
  const isIOS =
    /iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && maxTouchPoints > 1);
  if (isIOS) return /crios|fxios|edgios|opios/i.test(userAgent) ? 'ios-other' : 'ios-safari';
  if (/android/i.test(userAgent)) return 'android';
  return null;
}

export type InstallPromptVariant = 'none' | 'native' | InstallPlatform;

export function selectInstallPromptVariant(state: {
  seen: boolean;
  isStandalone: boolean;
  deferredPromptAvailable: boolean;
  platform: InstallPlatform | null;
}): InstallPromptVariant {
  if (state.seen || state.isStandalone || state.platform === null) return 'none';
  if (state.deferredPromptAvailable) return 'native';
  return state.platform;
}
