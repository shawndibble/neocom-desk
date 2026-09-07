/**
 * The one source for the Foreground Poller's live English wording — six
 * Notification Events, rendered in the browser via i18next (`src/i18n/
 * index.ts` splices these templates into `notifications.fired.*`).
 *
 * **Four of the six are also `projection.ts`'s.** A Scheduled Push row has no
 * i18next runtime to render from: `projection.ts` renders its final text
 * on-device before upload (ADR 0010 — the backend holds no EVE token, no SDE,
 * no i18n catalog, and never renders, it only stores and fires the
 * already-rendered row). Those four say the same thing either way, so they say
 * it once, here. This module is plain data plus a tiny substitution function
 * precisely so `projection.ts` can read it without `src/engine` importing
 * React/i18next.
 *
 * **The two planetary events are read by the live path alone.**
 * `projectionWording` hedges them on the push path — a reset run done in game
 * while the app is closed falsifies the prediction before it fires — and
 * `projection.ts` writes that weaker copy inline, as it already does for
 * `structureFuelLow`. Their assertive wording stays here because the live
 * path is the one that has actually watched the colony go idle;
 * `src/i18n/index.test.ts` pins the divergence so it cannot spread to the
 * other four by accident.
 *
 * `{{placeholder}}` matches i18next's own interpolation syntax so a template
 * reads identically wherever it is rendered from.
 */

export interface NotificationWordingTemplate {
  readonly title: string;
  readonly body: string;
}

export const SHARED_NOTIFICATION_WORDING = {
  skillLevelComplete: {
    title: 'Skill training complete',
    body: '{{character}} finished training {{skill}} {{level}}.',
  },
  characterNotTraining: {
    title: 'Not training',
    body: '{{character}} has no skill in training.',
  },
  industryJobComplete: {
    title: 'Industry job complete',
    body: "{{character}}'s industry job for {{item}} is complete.",
  },
  planetaryExtractionDone: {
    title: 'Extraction done',
    body: "{{character}}'s extraction on {{planet}} has stopped.",
  },
  planetaryExtractorExpiring: {
    title: 'Extractor expiring',
    body: "{{character}}'s extractor on {{planet}} expires in under {{hours}} hours.",
  },
  calendarEventStarting: {
    title: 'Calendar event starting',
    body: "{{character}}'s calendar event is starting.",
  },
} as const satisfies Record<string, NotificationWordingTemplate>;

export type SharedWordingEventId = keyof typeof SHARED_NOTIFICATION_WORDING;

/** Replaces every `{{key}}` in `template` with `vars[key]`; leaves an unmatched token as-is. */
export function renderWording(
  template: string,
  vars: Readonly<Record<string, string | number>>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match
  );
}
