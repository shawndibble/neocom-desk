/**
 * Device-local "has this device already been offered install" flag —
 * persisted under a plain (non-`sync.`-prefixed) key, same category as
 * `lastSeenVersion.ts`. Browser install-prompt permission is inherently
 * per-device (CONTEXT.md round 20), so this must never sync.
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
 * iOS Safari never fires `beforeinstallprompt`. Other iPhone/iPad browsers
 * (Chrome, Firefox, Edge for iOS) are required by Apple to embed WebKit and
 * don't expose the event either, so this only needs to rule those UAs out
 * rather than truly identify Safari.
 */
export function isIosSafari(userAgent: string): boolean {
  return /iphone|ipad|ipod/i.test(userAgent) && !/crios|fxios|edgios|opios/i.test(userAgent);
}

export type InstallPromptVariant = 'none' | 'native' | 'ios';

export function selectInstallPromptVariant(state: {
  seen: boolean;
  isStandalone: boolean;
  deferredPromptAvailable: boolean;
  isIOS: boolean;
}): InstallPromptVariant {
  if (state.seen || state.isStandalone) return 'none';
  if (state.deferredPromptAvailable) return 'native';
  if (state.isIOS) return 'ios';
  return 'none';
}
