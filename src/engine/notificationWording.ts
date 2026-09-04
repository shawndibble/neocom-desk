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
