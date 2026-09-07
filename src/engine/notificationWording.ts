/**
 * The one source for the English wording shared by the Foreground Poller's
 * live path and `projection.ts`'s Scheduled Push rows. The two render the
 * same six Notification Events from code that cannot share a runtime — the
 * browser (via i18next, `src/i18n/index.ts` splices this module's templates
 * into `notifications.fired.*`) and `projection.ts`, which renders a row's
 * final text on-device before upload (ADR 0010: the backend itself holds no
 * EVE token, no SDE, no i18n catalog, and never renders — it only stores
 * and fires the already-rendered row). This module is plain data plus a
 * tiny substitution function so `projection.ts` can read it without
 * `src/engine` importing React/i18next.
 *
 * `{{placeholder}}` matches i18next's own interpolation syntax so a
 * template reads identically wherever it is rendered from.
 *
 * Four of the six are shared by both paths. The two planetary events are
 * read by the **live path only**: `projection.ts` hedges them (a reset run
 * done in game while the app is closed falsifies the prediction before it
 * fires) and writes that copy inline, as it already does for
 * `structureFuelLow`. They stay here because the live path is the one that
 * has actually observed the colony go idle, and this is where its wording
 * belongs; `src/i18n/index.test.ts` pins the divergence so it cannot spread
 * to the other four by accident.
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
