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
  window.addEventListener('appinstalled', () => useInstallApp.setState({ deferredPrompt: null }));
}

export async function promptInstallApp(): Promise<void> {
  const event = useInstallApp.getState().deferredPrompt;
  if (!event) return;
  useInstallApp.setState({ deferredPrompt: null });
  await event.prompt();
  await event.userChoice;
}
