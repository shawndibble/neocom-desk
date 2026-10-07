/**
 * The two delivery-channel columns, shared by the "All Characters" section
 * and each Character's own section so the grid track and the captions above
 * it can't drift apart (they were duplicated, with a comment asking the next
 * editor to keep them in sync by hand).
 *
 * The captions matter more than they look: a column of bare checkboxes says
 * nothing about what it does, and the two channels are genuinely
 * independent — an event can raise a browser notification without joining
 * the Alerts page, or the reverse.
 */
import { HintText } from '@/components/ui/HintText';
import { useTranslation } from 'react-i18next';
import { NOTIFICATION_CHANNELS } from './eventSelection';

/**
 * One fixed-width track per delivery channel, shared by every grid in both
 * sections — the column captions, the select-all rows, the event rows, the
 * Family headers and the eve-type rows. They are independent grids that only
 * *look* like columns, so an auto track would size each to its own content
 * and the captions would drift off the checkboxes below the moment a caption
 * is wider than a checkbox. Which it is: the columns used to read "App" and
 * "List", neither of which said what it delivered.
 */
export const CHANNEL_COLUMNS = 'grid shrink-0 grid-cols-[4.25rem_4.25rem] justify-items-center';

/**
 * The caption row that sits directly above a block of channel checkboxes.
 * `pinned` glues it to the top of the viewport from `md` up while its
 * section's rows scroll beneath it (opaque, so rows don't show through); it
 * leaves with its own section. Phone is unchanged.
 */
export function ChannelColumnHeadings({ pinned = false }: { pinned?: boolean }) {
  const { t } = useTranslation();

  return (
    <div
      className={`flex items-center justify-between gap-3 border-b border-line px-3 py-1.5${
        pinned ? ' md:sticky md:top-0 md:z-10 md:bg-panel-2' : ''
      }`}
    >
      <span className="sr-only">{t('settings.notifications.columnEvent')}</span>
      <span aria-hidden="true" className="flex-1" />
      <div className={CHANNEL_COLUMNS}>
        {NOTIFICATION_CHANNELS.map((channel) => (
          //  HintText is focusable so the hint can be read without a pointer (ADR 0008);
          // uppercase micro-heading per docs/DESIGN.md §2, matching the Family headers below.
          <HintText
            key={channel}
            content={t(`settings.notifications.columnHint.${channel}`)}
            className="text-[0.6875rem] leading-tight font-semibold tracking-widest text-text-dim uppercase"
          >
            {t(`settings.notifications.column.${channel}`)}
          </HintText>
        ))}
      </div>
    </div>
  );
}
