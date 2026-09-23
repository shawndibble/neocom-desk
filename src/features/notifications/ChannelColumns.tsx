/**
 * The two delivery-channel columns, shared by the "All Characters" section
 * and each Character's own section so the grid track and the captions above
 * it can't drift apart (they were duplicated, with a comment asking the next
 * editor to keep them in sync by hand).
 *
 * The captions matter more than they look: a column of bare checkboxes says
 * nothing about what it does, and the two channels are genuinely
 * independent — an event can raise a browser notification without joining
 * the Overview list, or the reverse.
 */
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
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

/** The caption row that sits directly above a block of channel checkboxes. */
export function ChannelColumnHeadings() {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-1.5">
      <span className="sr-only">{t('settings.notifications.columnEvent')}</span>
      <span aria-hidden="true" className="flex-1" />
      <div className={CHANNEL_COLUMNS}>
        {NOTIFICATION_CHANNELS.map((channel) => (
          <Tooltip
            key={channel}
            content={t(`settings.notifications.columnHint.${channel}`)}
            openOnTap
          >
            {/* `tabIndex` because a Tooltip's trigger has to be focusable to
                be read without a pointer (`components/ui/Tooltip.tsx`, ADR
                0008), and the dotted underline is what says there is
                something to read. Uppercase micro-heading per docs/DESIGN.md
                §2, matching the Family headers further down. */}
            <span
              tabIndex={0}
              className="cursor-help text-[0.6875rem] leading-tight font-semibold tracking-widest text-text-dim uppercase underline decoration-dotted decoration-text-dim/50 underline-offset-2"
            >
              {t(`settings.notifications.column.${channel}`)}
            </span>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
