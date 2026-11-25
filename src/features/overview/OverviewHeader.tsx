/**
 * The Overview's header controls, handed to `CharacterHeader`'s slots: the
 * data age (`OverviewDataAge`, on the tab row) and the
 * controls (`OverviewNext` and `OverviewCustomize`, level with the bell).
 * Below `md` the page swaps Customize and the data age for one ⋮ menu
 * (`OverviewMoreMenu`) and Next becomes a borderless row.
 *
 * It reads what is on screen, not what is stored: the button and the age count
 * only the widgets the page draws (a widget hidden on a phone offers neither a
 * clock nor a read). There is no Refresh here (a failed widget's Retry bumps the
 * page's refresh epoch) and no Character switcher: the rail
 * footer and the command palette switch the active Character, and each
 * widget's own menu chooses its Character scope.
 */
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenuItem,
  HeaderMoreMenu,
  SEVERITY_TEXT,
  SeverityIcon,
  Tooltip,
  buttonClassName,
  CachedNotice,
} from '@/components/ui';
import {
  focusRingClassName,
  interactiveClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { formatAge } from '@/lib/age';
import { cx } from '@/lib/cx';
import { formatCountdown } from '@/lib/duration';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { DataAgePopover } from './DataAgePopover';
import { useOverviewRefresh } from './widgets/data/refreshContext';
import { useOverviewEdit } from './widgets/editContext';
import type { ChipTone } from './widgets/nextDeadline';
import type { OverviewSummary } from './useOverviewSummary';

/** The button's own ladder: amber under 3 h, red under 30 min (not the per-card severities). */
const CHIP_TEXT: Record<ChipTone, string> = {
  neutral: 'text-text',
  warning: SEVERITY_TEXT.warning,
  danger: SEVERITY_TEXT.critical,
};

/**
 * "Data updated N ago" on the tab row: the stalest read of any drawn
 * widget. Its tooltip names that widget; a click opens the per-widget table, so
 * "14h ago" is never a mystery (no Refresh: widgets retry themselves).
 */
export function OverviewDataAge({ summary, note }: { summary: OverviewSummary; note?: string }) {
  const { fetchedAt, breakdown, now } = summary;
  const { refresh } = useOverviewRefresh();
  if (!fetchedAt) return null;
  return (
    <DataAgePopover
      fetchedAt={fetchedAt}
      breakdown={breakdown}
      now={now}
      onRefresh={refresh}
      note={note}
    />
  );
}

/**
 * "Showing cached data · N ago" under the sub-nav when any drawn widget read
 * from the saved copy, at every width: `OverviewDataAge` above sits on a tab
 * row a phone has no room for, and says how old, not that it is a saved copy.
 */
export function OverviewCachedNotice({ summary }: { summary: OverviewSummary }) {
  const { fetchedAt, fromCache } = summary;
  if (!fromCache) return null;
  return <CachedNotice fetchedAt={fetchedAt} />;
}

/**
 * The Next deadline: a link to the page that owns the clock (a plain readout
 * when no page owns it; absent with no deadline). It is a child of
 * `CharacterHeader`'s flex row. From `md` it is a button left of Customize and
 * the bell. Below `md` it is a borderless row that fills what is left of the
 * controls' line under the name, its whole width the link (§6c "Topic
 * drill-in": a trailing GoTo chevron), the countdown first so a narrow
 * phone still shows it when the note truncates.
 */
export function OverviewNext({ summary }: { summary: OverviewSummary }) {
  const { t } = useTranslation();
  const narrow = useIsNarrow();
  const { next, remaining, tone } = summary;
  if (!next) return null;
  const countdown = (
    <>
      {tone !== 'neutral' && <SeverityIcon severity={tone === 'danger' ? 'critical' : 'warning'} />}
      <b className={cx('font-semibold tabular-nums', CHIP_TEXT[tone])}>
        {formatCountdown(remaining / 1000)}
      </b>
    </>
  );
  if (narrow) {
    const row = (
      <>
        {countdown}
        <span className="min-w-0 truncate text-text-dim">{next.note}</span>
      </>
    );
    return next.to === undefined ? (
      <span className="flex min-w-0 flex-1 items-center gap-2 text-sm whitespace-nowrap">
        {row}
      </span>
    ) : (
      <Link
        to={next.to}
        className={cx(
          'flex min-w-0 flex-1 items-center gap-2 rounded-xs text-sm whitespace-nowrap',
          tappableRowClassName,
          interactiveClassName,
          focusRingClassName
        )}
      >
        {row}
        <Icon.GoTo aria-hidden="true" className="ml-auto shrink-0 text-text-dim" />
      </Link>
    );
  }
  const content = (
    <>
      <span className="text-text-dim">{t('overview.header.next')}</span>
      {countdown}
      <span className="min-w-0 truncate text-text-dim normal-case md:max-w-40">{next.note}</span>
    </>
  );
  return (
    <div className="min-w-0">
      {next.to === undefined ? (
        // No page owns this clock: a plain readout, not a button that goes nowhere.
        <span className="flex min-w-0 items-center gap-2 text-sm whitespace-nowrap">{content}</span>
      ) : (
        <Tooltip content={t('overview.header.nextGoTo', { note: next.note })}>
          <Link
            to={next.to}
            className={buttonClassName({ size: 'md', className: 'min-w-0 whitespace-nowrap' })}
          >
            {content}
          </Link>
        </Tooltip>
      )}
    </div>
  );
}

/** Customize: icon-only on a phone (36px), icon and word from `md`. Hidden while the edit bar owns Done. */
export function OverviewCustomize() {
  const { t } = useTranslation();
  const { editing, startEditing } = useOverviewEdit();
  if (editing) return null;
  return (
    // `shrink-0`: its min-content is the 16px icon, so a crowded header row could squeeze it
    // under the 24px target floor (WCAG 2.5.8). `max-md:px-0`, not `px-0`: `cx` does not merge, so a bare
    // `px-0` loses to the size tier's `px-4` and the 36px box squeezes the icon to a dot.
    <Button className="w-9 shrink-0 max-md:px-0 md:w-auto" onClick={startEditing}>
      <Icon.EditBoard size={Icon.ICON_SIZE.md} aria-hidden="true" />
      <span className="sr-only md:not-sr-only">{t('overview.header.customize')}</span>
    </Button>
  );
}

/**
 * Below `md`: the header's one ⋮ menu, holding Customize and a Refresh of
 * every widget (its label carries the data age, which the tab row has no room
 * for). Two real actions are needed to earn the ⋮ (§6c), so while the edit
 * bar owns Done, or before any read has landed, the page keeps its single
 * control inline instead and this renders nothing.
 */
export function OverviewMoreMenu({ summary }: { summary: OverviewSummary }) {
  const { t } = useTranslation();
  const { editing, startEditing } = useOverviewEdit();
  const { refresh } = useOverviewRefresh();
  const { fetchedAt, now } = summary;
  if (editing || !fetchedAt) return null;
  return (
    <HeaderMoreMenu>
      <DropdownMenuItem onSelect={startEditing}>
        <Icon.EditBoard aria-hidden="true" />
        {t('overview.header.customize')}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={refresh}>
        <Icon.Refresh aria-hidden="true" />
        {t('overview.header.refreshAll')}
        <span className="ml-auto pl-3 text-xs text-text-dim">
          {formatAge(Math.max(0, now - fetchedAt.getTime()), t)}
        </span>
      </DropdownMenuItem>
    </HeaderMoreMenu>
  );
}
