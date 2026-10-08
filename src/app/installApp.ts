/**
 * The deferred `beforeinstallprompt` event, kept app-wide so Settings can offer
 * "Install this app" after the one-time banner is gone. The event fires once,
 * early, so the listener is registered when this module loads (App imports it)
 * rather than when the Settings panel mounts. `InstallPrompt` keeps its own
 * listener for the banner; both just `preventDefault()` and hold the event.
 */
import { create } from 'zustand';
import type { BeforeInstallPromptEvent } from './installPromptRules';

export const useInstallApp = create<{ deferredPrompt: BeforeInstallPromptEvent | null }>(() => ({
  deferredPrompt: null,
}));

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    useInstallApp.setState({ deferredPrompt: event as BeforeInstallPromptEvent });
  });
  // A prompt can only be used once, and it is moot after installing.
  window.addEventListener('appinstalled', () => useInstallApp.setState({ deferredPrompt: null }));
}

/** Show the native install dialog; the event is spent whatever the answer. */
export async function promptInstallApp(): Promise<void> {
  const event = useInstallApp.getState().deferredPrompt;
  if (!event) return;
  useInstallApp.setState({ deferredPrompt: null });
  await event.prompt();
  await event.userChoice;
}
