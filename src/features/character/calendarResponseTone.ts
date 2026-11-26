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

export const RESPONSE_BADGE_TONE: Record<CalendarEventSummary['event_response'], string> = {
  accepted: 'bg-success/10 text-success',
  declined: 'bg-danger/10 text-danger',
  tentative: 'bg-warning/10 text-warning',
  not_responded: 'bg-panel-2 text-text-dim',
};

export const RESPONSE_ICON: Record<CalendarEventSummary['event_response'], typeof Icon.Warn> = {
  accepted: Icon.Done,
  declined: Icon.Blocked,
  tentative: Icon.Warn,
  not_responded: Icon.Pending,
};
