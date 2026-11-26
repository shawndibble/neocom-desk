import { useCallback, useEffect, useState } from 'react';
import { create } from 'zustand';
import { createLocalSetting } from '@/lib/useLocalSetting';

export const NOTIFICATION_PERMISSION_PROMPT_KEY = 'notifications.permissionPrompt';

export type NotificationPermissionState = NotificationPermission | 'unsupported';

export interface NotificationPromptState {
  seen: boolean;
  outcome: NotificationPermission | null;
}

export const DEFAULT_NOTIFICATION_PROMPT_STATE: NotificationPromptState = {
  seen: false,
  outcome: null,
};

const OUTCOMES: readonly string[] = ['granted', 'denied', 'default'];

function parsePromptState(raw: unknown): NotificationPromptState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.seen !== 'boolean') return null;
  if (r.outcome !== null && !OUTCOMES.includes(r.outcome as string)) return null;
  return { seen: r.seen, outcome: r.outcome as NotificationPermission | null };
}

export const useNotificationPromptState = createLocalSetting<NotificationPromptState>({
  key: NOTIFICATION_PERMISSION_PROMPT_KEY,
  defaultValue: DEFAULT_NOTIFICATION_PROMPT_STATE,
  parse: parsePromptState,
});

export function readNotificationPermission(): NotificationPermissionState {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    return OUTCOMES.includes(result) ? result : readNotificationPermission();
  } catch {
    return readNotificationPermission();
  }
}

export function promptStateAfterAsk(outcome: NotificationPermissionState): NotificationPromptState {
  return { seen: true, outcome: outcome === 'unsupported' ? null : outcome };
}

export function shouldShowPermissionExplainer(state: {
  hydrated: boolean;
  seen: boolean;
  hasCharacter: boolean;
  permission: NotificationPermissionState;
  installRequired: boolean;
}): boolean {
  if (!state.hydrated || state.seen || !state.hasCharacter) return false;
  return (
    state.permission === 'default' || (state.installRequired && state.permission === 'unsupported')
  );
}

export function notificationsBlocked(permission: NotificationPermissionState): boolean {
  return permission === 'denied';
}

export function useNotificationPermission(): {
  permission: NotificationPermissionState;
  refresh: () => void;
} {
  const [permission, setPermission] = useState<NotificationPermissionState>(
    readNotificationPermission
  );
  const refresh = useCallback(() => setPermission(readNotificationPermission()), []);

  useEffect(() => {
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  return { permission, refresh };
}

export const ALERTS_OFFER_SEEN_KEY = 'notifications.alertsOfferSeen';

export const useAlertsOfferSeen = createLocalSetting<boolean>({
  key: ALERTS_OFFER_SEEN_KEY,
  defaultValue: false,
});

export function shouldShowAlertsOffer(state: {
  hydrated: boolean;
  alertsOfferSeen: boolean;
  grantedHere: boolean;
  permission: NotificationPermissionState;
  installRequired: boolean;
  characterId: number | null;
}): boolean {
  return (
    state.hydrated &&
    !state.alertsOfferSeen &&
    state.grantedHere &&
    state.permission === 'granted' &&
    !state.installRequired &&
    state.characterId !== null
  );
}

export const useGrantedHere = create<{ granted: boolean }>(() => ({ granted: false }));
