/**
 * Select all / Select none and the count-labelled bulk button (DESIGN.md §6c Bulk selection) for
 * a claim list. From `sm` up it is one row above the table; on a phone Select all stays in the
 * list and the bar that appears once a row is ticked pins above the tab bar.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { textActionClassName } from '@/components/ui';
import { cx } from '@/lib/cx';
import { formatIskCompact } from '@/lib/isk';
import { useIsPhone } from '@/lib/useIsPhone';

export function SrpBulkBar({
  selected,
  selectable,
  total,
  onSelectAll,
  onSelectNone,
  children,
}: {
  selected: number;
  /** Rows a tick can apply to. */
  selectable: number;
  /** ISK of the ticked rows, for the phone bar's second line. */
  total: number;
  onSelectAll: () => void;
  onSelectNone: () => void;
  /** The count-labelled action button, shown once a row is ticked. */
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  if (selectable === 0) return null;
  if (phone) {
    return (
      <div className="grid gap-2 pt-3">
        <div className="flex justify-end px-3">
          <button type="button" className={textActionClassName()} onClick={onSelectAll}>
            {t('srp.officer.bulk.selectAll', { count: selectable })}
          </button>
        </div>
        {selected > 0 && (
          <div
            className={cx(
              'sticky bottom-[var(--bottom-nav-clearance)] z-30 mx-3 flex items-center gap-3 rounded-xs border border-line-bright bg-panel p-2 shadow-lg'
            )}
          >
            <div className="min-w-0 flex-1 text-sm tabular-nums" role="status">
              <span className="block font-semibold">
                {t('srp.officer.bulk.selected', { count: selected })}
              </span>
              <span className="block text-xs text-text-dim">
                {t('srp.officer.iskAmount', { isk: formatIskCompact(total) })}
              </span>
            </div>
            <button type="button" className={textActionClassName()} onClick={onSelectNone}>
              {t('srp.officer.bulk.clear')}
            </button>
            {children}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 pt-3">
      <button type="button" className={textActionClassName()} onClick={onSelectAll}>
        {t('srp.officer.bulk.selectAll', { count: selectable })}
      </button>
      <button
        type="button"
        className={textActionClassName()}
        aria-disabled={selected === 0 || undefined}
        onClick={selected === 0 ? undefined : onSelectNone}
      >
        {t('srp.officer.bulk.selectNone')}
      </button>
      <span className="text-xs text-text-dim tabular-nums" role="status">
        {t('srp.officer.bulk.selected', { count: selected })}
      </span>
      <span className="ml-auto flex flex-wrap gap-2">{selected > 0 && children}</span>
    </div>
  );
}
