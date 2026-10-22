/**
 * Calendar event detail, opened from any view (Month/Week/Agenda) instead of
 * an inline panel — keeps the list/grid above from being pushed around by a
 * long description. Mounted only while an event is selected (mounting is the
 * open signal, `ItemDetailModal`'s pattern). `event` seeds the title/date
 * immediately so there's no flash while the full detail fetches.
 *
 * A failed load with nothing cached is a real failure state, not an empty
 * one: the page's Refresh and the app-wide re-login notice both sit behind
 * this modal's backdrop, so recovery (Try again, or Log in again for an auth
 * failure) has to live in the body — `SkillDetailModal`'s pattern.
 */
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { ExternalMark } from '@/components/ui/ExternalLink';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  EmptyState,
  Modal,
  NeedsConnection,
  CachedNotice,
  Spinner,
  type ButtonVariant,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { KIND_FILL, KIND_TEXT } from '@/components/ui/kindTone';
import {
  loadCalendarEvent,
  respondToCalendarEvent,
  type RsvpResult,
} from '@/features/character/calendar';
import { RESPONSE_BADGE_TONE, RESPONSE_ICON, RESPONSE_KEY } from './calendarResponseTone';
import { stripEveMarkup } from '@/features/skills/typeDisplay';
import { buildIcsFile, googleCalendarUrl, type CalendarExportEvent } from '@/lib/calendarExport';
import { downloadTextFile } from '@/lib/download';
import { GrantBanner } from '@/app/GrantNote';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import { formatCalendarTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import type { CachedResult } from '@/esi/cache';
import type {
  CalendarEventDetail,
  CalendarEventSummary,
  CalendarRsvpResponse,
} from '@/esi/endpoints';

const RSVP_OPTIONS: { response: CalendarRsvpResponse; labelKey: string }[] = [
  { response: 'accepted', labelKey: 'calendar.rsvpAccept' },
  { response: 'declined', labelKey: 'calendar.rsvpDecline' },
  { response: 'tentative', labelKey: 'calendar.rsvpTentative' },
];

/** The active button already turns this tone (DESIGN.md §7's other signal is its own icon + label, not a second, redundant telling). */
const RSVP_FAILURE_KEY: Record<Exclude<RsvpResult, 'saved'>, string> = {
  offline: 'calendar.rsvpOffline',
  unconfirmed: 'calendar.rsvpUnconfirmed',
  failed: 'calendar.rsvpFailed',
};

const RSVP_ACTIVE_VARIANT: Record<CalendarRsvpResponse, ButtonVariant> = {
  accepted: 'success',
  declined: 'danger',
  tentative: 'warning',
};

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

/**
 * `needs-reauth` only when the live call failed on auth *and* nothing is
 * cached — a stale copy still renders as `ready`, and the app-wide notice
 * covers the auth failure there.
 */
type DetailState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'needs-reauth' }
  | { status: 'ready'; detail: CachedResult<CalendarEventDetail> };

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
  const zone = useTimeZone();
  // `retry` (Try again) re-runs the load in place — closing and reopening
  // was otherwise the only way back to the network.
  const load = useAsyncLoad(
    useCallback(() => loadCalendarEvent(characterId, event.event_id), [characterId, event.event_id])
  );
  // The answer just saved, laid over the loaded copy until the next load.
  const [savedResponse, setSavedResponse] = useState<{
    eventId: number;
    response: CalendarRsvpResponse;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [rsvpFailed, setRsvpFailed] = useState<Exclude<RsvpResult, 'saved'> | null>(null);

  async function respond(response: CalendarRsvpResponse) {
    setSaving(true);
    setRsvpFailed(null);
    try {
      const outcome = await respondToCalendarEvent(characterId, event.event_id, response);
      if (outcome !== 'saved') {
        setRsvpFailed(outcome);
        return;
      }
      setSavedResponse({ eventId: event.event_id, response });
      onResponded?.(event.event_id, response);
    } finally {
      setSaving(false);
    }
  }

  let state: DetailState;
  if (load.status === 'failed') state = { status: 'failed' };
  else if (load.status !== 'ready') state = { status: 'loading' };
  else if (load.data.cached) {
    const { cached } = load.data;
    state = {
      status: 'ready',
      detail:
        savedResponse?.eventId === event.event_id
          ? { ...cached, data: { ...cached.data, response: savedResponse.response } }
          : cached,
    };
  } else state = { status: load.data.needsReauth ? 'needs-reauth' : 'failed' };

  return (
    <Modal open onClose={onClose} title={event.title}>
      {state.status === 'loading' ? (
        <div className="flex justify-center py-8">
          <Spinner label={t('common.loading')} />
        </div>
      ) : state.status === 'needs-reauth' ? (
        // No Try again: retrying can't fix an expired or revoked grant.
        <GrantBanner
          characterId={characterId}
          endpoints={['getCharacterCalendarEvent']}
          title={t('calendar.detailReauthTitle')}
          hint={t('calendar.detailReauthHint')}
          actionLabel={t('calendar.reauthAction')}
        />
      ) : state.status === 'failed' ? (
        <EmptyState
          title={t('common.loadFailedTitle')}
          hint={t('calendar.detailLoadFailedHint')}
          action={
            <Button size="sm" onClick={load.retry}>
              {t('common.retry')}
            </Button>
          }
          className="py-8"
        />
      ) : (
        <div className="space-y-3 text-xs">
          {/* Kind-colour bar, bled to the modal's edges: the same hue the Coming Up Rail and Calendar Map use for `calendarEvent`, so the popup carries the identity a plain dialog otherwise loses. */}
          <div className={`-mx-3 -mt-3 h-1 ${KIND_FILL.calendarEvent}`} />
          {state.detail.fromCache && <CachedNotice fetchedAt={state.detail.fetchedAt} />}
          <p className="flex items-center gap-1.5 text-text-dim">
            <Icon.CalendarEvent
              className={`size-4 shrink-0 ${KIND_TEXT.calendarEvent}`}
              aria-hidden="true"
            />
            {formatCalendarTimestamp(new Date(state.detail.data.date), zone)}
            {state.detail.data.importance > 0 && <> · {t('calendar.important')}</>}
          </p>
          <p className="rounded-xs border border-line bg-panel-2 p-2 whitespace-pre-wrap text-text-dim">
            {stripEveMarkup(state.detail.data.text)}
          </p>
          <div className="space-y-2 border-t border-line pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p id="rsvp-response-label" className={eyebrowClassName}>
                {t('calendar.yourResponse')}
              </p>
              {/*
                Only for "no answer yet" — once a response is picked, the
                button it picked already turns that tone (DESIGN.md §7's
                other signal is `aria-pressed` plus the button's own icon and
                label), so a second badge repeating the same word/color here
                would just double it.
              */}
              {state.detail.data.response === 'not_responded' &&
                (() => {
                  const ResponseIcon = RESPONSE_ICON[state.detail.data.response];
                  return (
                    <p
                      className={`inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-widest uppercase ${RESPONSE_BADGE_TONE[state.detail.data.response]}`}
                    >
                      <ResponseIcon size={Icon.ICON_SIZE.sm} aria-hidden="true" />
                      {t(RESPONSE_KEY[state.detail.data.response])}
                    </p>
                  );
                })()}
            </div>
            <div
              role="group"
              aria-labelledby="rsvp-response-label"
              className="flex flex-wrap gap-2"
            >
              {RSVP_OPTIONS.map(({ response, labelKey }) => {
                const OptionIcon = RESPONSE_ICON[response];
                const active = state.detail.data.response === response;
                return (
                  <NeedsConnection key={response}>
                    <Button
                      size="md"
                      variant={active ? RSVP_ACTIVE_VARIANT[response] : 'ghost'}
                      aria-pressed={active}
                      disabled={saving}
                      onClick={() => void respond(response)}
                    >
                      <OptionIcon size={Icon.ICON_SIZE.sm} aria-hidden="true" />
                      {t(labelKey)}
                    </Button>
                  </NeedsConnection>
                );
              })}
            </div>
            {rsvpFailed !== null && (
              <p role="alert" className="mt-2 text-[0.6875rem] text-danger">
                {t(RSVP_FAILURE_KEY[rsvpFailed])}
              </p>
            )}
          </div>
          <div className="space-y-2 border-t border-line pt-2">
            <p className={eyebrowClassName}>{t('calendar.export')}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  const exportEvent = exportEventOf(state.detail.data);
                  downloadTextFile(
                    `${exportEvent.eventId}.ics`,
                    buildIcsFile(exportEvent),
                    'text/calendar;charset=utf-8'
                  );
                }}
              >
                <Icon.Download size={Icon.ICON_SIZE.sm} aria-hidden="true" />
                {t('calendar.downloadIcs')}
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  window.open(
                    googleCalendarUrl(exportEventOf(state.detail.data)),
                    '_blank',
                    'noopener'
                  )
                }
              >
                <Icon.CalendarEvent size={Icon.ICON_SIZE.sm} aria-hidden="true" />
                {t('calendar.addToGoogleCalendar')}
                <ExternalMark />
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
