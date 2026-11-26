import i18n from '@/i18n';
import type { NotificationCopy } from '@/engine/notificationWording';

export interface DomainCopy<TFire, TNames> {
  readonly poll: (fire: TFire, characterName: string, names: TNames) => NotificationCopy;
  readonly subjectOf?: (fire: TFire) => number | undefined;
}

export type NoNames = Record<string, never>;

export function fired(eventId: string, variant: string, vars?: Record<string, unknown>): string {
  return i18n.t(`notifications.fired.${eventId}.${variant}`, vars);
}

export function simple(eventId: string, vars: Record<string, unknown>): NotificationCopy {
  return { title: fired(eventId, 'title'), body: fired(eventId, 'body', vars) };
}

export { DAY_MS, HOUR_MS } from '@/lib/age';
