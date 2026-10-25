/**
 * The Overview's header controls, handed to `CharacterHeader`'s slots: the
 * data age (`OverviewDataAge`, on the tab row) and the
 * controls (`OverviewNext` and `OverviewCustomize`, level with the bell).
 *
 * It reads what is on screen, not what is stored: the button and the age count
 * only the widgets the page draws (a widget hidden on a phone offers neither a
 * clock nor a read). There is no Refresh here (a failed widget's Retry bumps the
 * page's refresh epoch) and no Character switcher: the rail
 * footer and the command palette switch the active Character, and each
 * widget's own menu chooses its Character scope.
 */
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  SEVERITY_TEXT,
  SeverityIcon,
  Tooltip,
  buttonClassName,
  CachedNotice,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { formatCountdown } from '@/lib/duration';
import { readLocal, writeLocal } from '@/lib/safeLocalStorage';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { DataAgePopover } from './DataAgePopover';
import { useOverviewRefresh } from './widgets/data/refreshContext';
import { useOverviewEdit } from './widgets/editContext';
import { nextShape, reservedNextHeight, type ChipTone } from './widgets/nextDeadline';
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
 * The Next deadline: a link to the page that owns the clock, drawn as a plain
 * button (a plain readout when no page owns it; absent with no deadline). It is a child of `CharacterHeader`'s flex
 * row: left of Customize and the bell from `md`, on its own full-width line
 * under them on a phone.
 */
export function OverviewNext({ summary }: { summary: OverviewSummary }) {
  const { t } = useTranslation();
  const { next, remaining, tone, pending } = summary;
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const shape = nextShape(next);
  const shapeKey = `overview.nextShape.${characterId ?? 0}`;
  // Once every read is in, remember what this Character's header drew, for the next load.
  useEffect(() => {
    if (!pending) writeLocal(shapeKey, shape);
  }, [pending, shape, shapeKey]);
  if (!next) {
    // On a phone the button is a line of its own: hold last time's room open while the reads
    // that may offer a clock are still out, so the board does not drop when it arrives.
    const reserved = pending ? reservedNextHeight(readLocal(shapeKey)) : null;
    return reserved ? (
      <div aria-hidden="true" className={cx('order-last basis-full md:hidden', reserved)} />
    ) : null;
  }
  const content = (
    <>
      <span className="text-text-dim">{t('overview.header.next')}</span>
      {tone !== 'neutral' && <SeverityIcon severity={tone === 'danger' ? 'critical' : 'warning'} />}
      <b className={cx('font-semibold tabular-nums', CHIP_TEXT[tone])}>
        {formatCountdown(remaining / 1000)}
      </b>
      <span className="min-w-0 truncate text-text-dim normal-case md:max-w-40">{next.note}</span>
    </>
  );
  return (
    <div className="order-last min-w-0 basis-full md:order-none md:basis-auto">
      {next.to === undefined ? (
        // No page owns this clock: a plain readout, not a button that goes nowhere.
        <span className="flex min-w-0 items-center gap-2 whitespace-nowrap text-sm">{content}</span>
      ) : (
        <Tooltip content={t('overview.header.nextGoTo', { note: next.note })}>
          <Link
            to={next.to}
            className={buttonClassName({
              size: 'md',
              className: 'w-full min-w-0 whitespace-nowrap md:w-auto',
            })}
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
    // under the 24px target floor (WCAG 2.5.8).
    <Button className="w-9 shrink-0 px-0 md:w-auto md:px-4" onClick={startEditing}>
      <Icon.EditBoard size={Icon.ICON_SIZE.md} aria-hidden="true" />
      <span className="sr-only md:not-sr-only">{t('overview.header.customize')}</span>
    </Button>
  );
}
