/**
 * Calendar event detail, opened from any view (Month/Week/Agenda) instead of
 * an inline panel — keeps the list/grid above from being pushed around by a
 * long description. Mounted only while an event is selected (mounting is the
 * open signal, `ItemDetailModal`'s pattern). `event` seeds the title/date
 * immediately so there's no flash while the full detail fetches.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Modal, Spinner } from '@/components/ui';
import { loadCalendarEvent, respondToCalendarEvent } from '@/features/character/calendar';
import { stripEveMarkup } from '@/features/skills/typeDisplay';
import { buildIcsFile, googleCalendarUrl, type CalendarExportEvent } from '@/lib/calendarExport';
import { downloadTextFile } from '@/lib/download';
import { formatCalendarTimestamp } from '@/lib/timestamp';
import type { CachedResult } from '@/esi/cache';
import type {
  CalendarEventDetail,
  CalendarEventSummary,
  CalendarRsvpResponse,
} from '@/esi/endpoints';

const RSVP_OPTIONS: {
  response: CalendarRsvpResponse;
  labelKey: string;
  variant: 'primary' | 'danger';
}[] = [
  { response: 'accepted', labelKey: 'calendar.rsvpAccept', variant: 'primary' },
  { response: 'declined', labelKey: 'calendar.rsvpDecline', variant: 'danger' },
  { response: 'tentative', labelKey: 'calendar.rsvpTentative', variant: 'primary' },
];

/** `detail.text` is markup, but the export formats want plain text — the same strip already used for the on-screen body. */
function exportEventOf(detail: CalendarEventDetail): CalendarExportEvent {
  return {
    eventId: detail.event_id,
    title: detail.title,
    start: new Date(detail.date),
    durationMinutes: detail.duration,
    description: detail.text ? stripEveMarkup(detail.text) : undefined,
  };
}

export interface EventDetailModalProps {
  characterId: number;
  event: CalendarEventSummary;
  onClose: () => void;
  /**
   * Fired after a successful RSVP write, alongside the cache patch inside
   * `respondToCalendarEvent`. The route's own event list/board (loaded via
   * `useRouteSnapshot`, not a live query) never sees a Dexie write on its
   * own, so it needs this to repaint the Coming Up Rail / Calendar Map
   * without forcing a live ESI refetch — which could reapply ESI's own
   * still-propagating pre-RSVP response over the optimistic update.
   */
  onResponded?: (eventId: number, response: CalendarRsvpResponse) => void;
}

export function EventDetailModal({
  characterId,
  event,
  onClose,
  onResponded,
}: EventDetailModalProps) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<CachedResult<CalendarEventDetail> | null | undefined>(
    undefined
  );
  const [saving, setSaving] = useState(false);

  async function respond(response: CalendarRsvpResponse) {
    setSaving(true);
    try {
      const ok = await respondToCalendarEvent(characterId, event.event_id, response);
      if (!ok) return;
      setDetail((prev) => (prev ? { ...prev, data: { ...prev.data, response } } : prev));
      onResponded?.(event.event_id, response);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setDetail(undefined);
      const result = await loadCalendarEvent(characterId, event.event_id);
      if (!cancelled) setDetail(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, event.event_id]);

  return (
    <Modal open onClose={onClose} title={event.title}>
      {detail === undefined ? (
        <div className="flex justify-center py-8">
          <Spinner label={t('common.loading')} />
        </div>
      ) : detail === null ? (
        <EmptyState title={t('calendar.emptyTitle')} className="py-8" />
      ) : (
        <div className="space-y-2 text-xs">
          <p className="text-text-dim">
            {formatCalendarTimestamp(new Date(detail.data.date))} ·{' '}
            {t('calendar.importance', { value: detail.data.importance })}
          </p>
          <p className="whitespace-pre-wrap text-text-dim">{stripEveMarkup(detail.data.text)}</p>
          <div className="flex flex-wrap gap-2 border-t border-line pt-2">
            {RSVP_OPTIONS.map(({ response, labelKey, variant }) => (
              <Button
                key={response}
                size="sm"
                variant={detail.data.response === response ? variant : 'ghost'}
                disabled={saving}
                onClick={() => void respond(response)}
              >
                {t(labelKey)}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line pt-2">
            <Button
              size="sm"
              onClick={() => {
                const exportEvent = exportEventOf(detail.data);
                downloadTextFile(
                  `${exportEvent.eventId}.ics`,
                  buildIcsFile(exportEvent),
                  'text/calendar;charset=utf-8'
                );
              }}
            >
              {t('calendar.downloadIcs')}
            </Button>
            <Button
              size="sm"
              onClick={() =>
                window.open(googleCalendarUrl(exportEventOf(detail.data)), '_blank', 'noopener')
              }
            >
              {t('calendar.addToGoogleCalendar')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
