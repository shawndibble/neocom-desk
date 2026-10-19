/** Shared pieces of the per-domain copy tables in this directory (issue #4111). */
import i18n from '@/i18n';
import type { NotificationCopy } from '@/engine/notificationWording';

/** A domain's copy as `pollDomains/` consumes it; `push` is passed to its own `project*`. */
export interface DomainCopy<TFire, TNames> {
  /** Live wording for a fire the Foreground Poller observed. */
  readonly poll: (fire: TFire, characterName: string, names: TNames) => NotificationCopy;
  /**
   * The id of the row this fire was about, for the events whose destination
   * pulses it (`notificationOptions.ts`'s `SUBJECT_URLS` builds the URL).
   */
  readonly subjectOf?: (fire: TFire) => number | undefined;
}

/** Nothing to look up. */
export type NoNames = Record<string, never>;

export function fired(eventId: string, variant: string, vars?: Record<string, unknown>): string {
  return i18n.t(`notifications.fired.${eventId}.${variant}`, vars);
}

/** The shape nearly every event shares: a fixed title, one body. */
export function simple(eventId: string, vars: Record<string, unknown>): NotificationCopy {
  return { title: fired(eventId, 'title'), body: fired(eventId, 'body', vars) };
}

export { DAY_MS, HOUR_MS } from '@/lib/age';
