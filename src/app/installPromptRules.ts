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
 *
 * Android splits Firefox from the Chromium browsers (Chrome, Samsung
 * Internet, Edge…). Chromium fires `beforeinstallprompt` — late, and never
 * when the app is already installed — so it waits for that event rather
 * than showing menu instructions that could be dismissed (forever) before
 * the native button arrives, or that would tell an installed user to
 * install. Firefox never fires it, so it gets written instructions.
 */
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
}): InstallPromptVariant {
  if (state.seen || state.isStandalone || state.platform === null) return 'none';
  if (state.deferredPromptAvailable) return 'native';
  return state.platform === 'android' ? 'none' : state.platform;
}

export type InstallAppVariant =
  'none' | 'installed' | 'native' | 'menu' | Exclude<InstallPlatform, 'android'>;

/**
 * What Settings' "Install this app" panel shows. Unlike the one-time banner it
 * ignores `seen`: it is the later path for someone who dismissed the banner.
 * Still mobile-only like the banner: desktop browsers surface their own
 * install affordance, so the panel is hidden there. Where an Android browser
 * gave no native prompt it falls back to a pointer at the browser's menu.
 */
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
