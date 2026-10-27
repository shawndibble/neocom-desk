/** Shared i18n key + colour-tone lookup for an event's RSVP response, read by the Coming Up Rail's rows. */
import type { CalendarEventSummary } from '@/esi/endpoints';
import * as Icon from '@/components/ui/icons';

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
  not_responded: 'text-text-dim',
};

/** Badge fill for `EventDetailModal`'s status pill — same tone family as `RESPONSE_TEXT_TONE`, plus a fill (no border: it is a status word, not a control). */
export const RESPONSE_BADGE_TONE: Record<CalendarEventSummary['event_response'], string> = {
  accepted: 'bg-success/10 text-success',
  declined: 'bg-danger/10 text-danger',
  tentative: 'bg-warning/10 text-warning',
  not_responded: 'bg-panel-2 text-text-dim',
};

/** The glyph for each response — `EventDetailModal`'s status pill and its RSVP buttons. */
export const RESPONSE_ICON: Record<CalendarEventSummary['event_response'], typeof Icon.Warn> = {
  accepted: Icon.Done,
  declined: Icon.Blocked,
  tentative: Icon.Warn,
  not_responded: Icon.Pending,
};
