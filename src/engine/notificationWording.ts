export interface NotificationCopy {
  readonly title: string;
  readonly body: string;
}

export interface NotificationWordingTemplate {
  readonly title: string;
  readonly body: string;
  readonly bodyUnnamed?: string;
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
  cloneJumpReady: {
    title: 'Clone jump ready',
    body: '{{character}} can jump clones again.',
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
    body: '{{character}}: {{event}} is starting.',
    bodyUnnamed: "{{character}}'s calendar event is starting.",
  },
} as const satisfies Record<string, NotificationWordingTemplate>;

export type SharedWordingEventId = keyof typeof SHARED_NOTIFICATION_WORDING;

export function renderWording(
  template: string,
  vars: Readonly<Record<string, string | number>>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match
  );
}

export function renderSharedWording(
  eventId: SharedWordingEventId,
  vars: Readonly<Record<string, string | number>>,
  variant: 'body' | 'bodyUnnamed' = 'body'
): NotificationCopy {
  const template: NotificationWordingTemplate = SHARED_NOTIFICATION_WORDING[eventId];
  const body = (variant === 'bodyUnnamed' ? template.bodyUnnamed : undefined) ?? template.body;
  return { title: template.title, body: renderWording(body, vars) };
}
