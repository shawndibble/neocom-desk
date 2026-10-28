/**
 * The columns of a Topic's event table, shared by every row so the captions
 * and the checkboxes under them can't drift apart.
 *
 * The captions matter more than they look: a column of bare checkboxes says
 * nothing about what it does, and the two channels are genuinely
 * independent — an event can raise a browser notification without joining
 * the Alerts page, or the reverse. On a phone the table has no header: each
 * row prints "Device" and "Alerts" beside its own boxes instead.
 */
import { HintText } from '@/components/ui/HintText';
import { useTranslation } from 'react-i18next';
import { NOTIFICATION_CHANNELS } from './eventSelection';
import { NO_CHANNEL_OFF, type ChannelOffMap } from './channelOff';

/**
 * From `md` up: Event, Device, Alerts, Warn ahead, Characters. Rows are
 * independent grids that only *look* like one table, so the tracks are fixed
 * rather than auto: an auto track would size each row to its own content and
 * the captions would drift off the checkboxes below. Below `md` the cells
 * stack and the row is a flex-wrap block (`AggregateRow`).
 */
export const EVENT_ROW_GRID =
  'md:grid md:grid-cols-[minmax(0,1fr)_4.25rem_4.25rem_minmax(8rem,12rem)_7rem] md:items-center md:gap-x-3';

/** The Device and Alerts cells of an `EVENT_ROW_GRID` row. */
export const DEVICE_CELL = 'md:col-start-2 md:row-start-1 md:justify-self-center';
export const ALERTS_CELL = 'md:col-start-3 md:row-start-1 md:justify-self-center';

/**
 * The caption row that sits directly above a Topic's rows, from `md` up.
 * `pinned` glues it to the top of the viewport while its rows scroll beneath
 * it (opaque, so rows don't show through); it leaves with its own table.
 */
export function ChannelColumnHeadings({
  pinned = false,
  channelOff = NO_CHANNEL_OFF,
}: {
  pinned?: boolean;
  /** A channel that is off dims its caption, with its boxes below (issue #5330). */
  channelOff?: ChannelOffMap;
}) {
  const { t } = useTranslation();
  const caption =
    'text-[0.6875rem] leading-tight font-semibold tracking-widest text-text-dim uppercase';

  return (
    <div
      className={`hidden border-b border-line px-3 py-1.5 ${EVENT_ROW_GRID}${
        pinned ? ' md:sticky md:top-0 md:z-10 md:bg-panel-2' : ''
      }`}
    >
      <span className={caption}>{t('settings.notifications.columnEvent')}</span>
      {NOTIFICATION_CHANNELS.map((channel) => (
        //  HintText is focusable so the hint can be read without a pointer (ADR 0008);
        // uppercase micro-heading per docs/DESIGN.md §2.
        <HintText
          key={channel}
          content={t(`settings.notifications.columnHint.${channel}`)}
          className={`${caption} justify-self-center${channelOff[channel] === null ? '' : ' opacity-60'}`}
        >
          {t(`settings.notifications.column.${channel}`)}
        </HintText>
      ))}
      <span className={caption}>{t('settings.notifications.columnWarnAhead')}</span>
      <span className={caption}>{t('settings.notifications.columnCharacters')}</span>
    </div>
  );
}
