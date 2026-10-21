import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  controlHeightClassName,
  focusRingClassName,
  interactiveClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { formatAge } from '@/lib/age';
import type { FetchRow } from './widgets/headerSummary';
import { boardKey, useWidgetBoard } from './widgets/board';
import { getKind } from './widgets/kinds';

/**
 * The button on a board's tab row ("Data updated 2m ago") and the popover
 * it opens: one row per widget kind with its own age, and Refresh all. Drawn
 * from plain props so the signed-out landing page's demo shows the very same
 * control over sample reads (`OverviewDataAge` feeds it the live ones).
 *
 * Its tooltip names the stalest widget; a click opens the per-widget table, so
 * "14h ago" is never a mystery.
 */
export function DataAgePopover({
  fetchedAt,
  breakdown,
  now,
  onRefresh,
  note,
}: {
  /** The stalest read, which sets the age the button shows. */
  fetchedAt: Date;
  /** Stalest first (`fetchBreakdown`), so the row that sets the age leads. */
  breakdown: readonly FetchRow[];
  now: number;
  onRefresh: () => void;
  /** A line about how fresh the data can be at all (the Corp Board's hourly cache). */
  note?: string;
}) {
  const { t } = useTranslation();
  const board = useWidgetBoard();
  const title = (kind: string) => {
    const def = getKind(kind);
    return def ? t(def.titleKey) : kind;
  };
  const age = (date: Date) => formatAge(Math.max(0, now - date.getTime()), t);
  const stalest = breakdown[0];
  return (
    <Popover>
      <Tooltip
        content={t('overview.header.stalest', {
          name: title(stalest.kind),
          age: age(fetchedAt),
        })}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cx(
              'inline-flex cursor-pointer items-center gap-1 rounded-xs border border-line px-1.5 text-[0.6875rem] text-text-dim hover:border-line-bright hover:bg-panel-2 hover:text-text',
              controlHeightClassName.sm,
              interactiveClassName,
              focusRingClassName
            )}
          >
            <span className="max-sm:sr-only">{t('overview.header.updated')}</span>
            <DataAgeBadge date={fetchedAt} alwaysVisible tooltip={false} />
            <Icon.Expanded className="size-3" aria-hidden="true" />
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-0">
        <table className="w-full text-xs">
          <caption className="sr-only">{t(boardKey(board, 'header.breakdownCaption'))}</caption>
          <thead>
            <tr className="border-b border-line text-left text-text-dim uppercase">
              <th scope="col" className="px-3 py-2 font-semibold tracking-widest">
                {t('overview.header.breakdownWidget')}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold tracking-widest">
                {t('overview.header.breakdownUpdated')}
              </th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((row) => (
              <tr key={row.kind} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  {title(row.kind)}
                </th>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.fetchedAt ? (
                    <DataAgeBadge date={row.fetchedAt} alwaysVisible className="justify-end" />
                  ) : (
                    <span className="text-text-dim">{t('overview.header.breakdownNever')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {note && <p className="border-t border-line px-3 py-2 text-xs text-text-dim">{note}</p>}
        <div className="border-t border-line p-2">
          <Button size="sm" onClick={onRefresh} className="w-full">
            <Icon.Refresh aria-hidden="true" />
            {t('overview.header.refreshAll')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
