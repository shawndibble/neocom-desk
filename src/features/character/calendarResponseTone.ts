/** Shared i18n key + colour-tone lookup for an event's RSVP response, read by the Coming Up Rail's rows. */
import type { CalendarEventSummary } from '@/esi/endpoints';

export const RESPONSE_KEY: Record<CalendarEventSummary['event_response'], string> = {
  accepted: 'calendar.responseAccepted',
  declined: 'calendar.responseDeclined',
  tentative: 'calendar.responseTentative',
  not_responded: 'calendar.responseNotResponded',
};

export const RESPONSE_TEXT_TONE: Record<CalendarEventSummary['event_response'], string> = {
  accepted: 'text-success',
  declined: 'text-danger',
  tentative: 'text-warning',
  not_responded: 'text-text-faint',
};
