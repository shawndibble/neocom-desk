import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@/components/ui';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { dismissEntries } from './assignments';
import type { DisplayRow } from './groupRows';

interface BulkDismissDialogProps {
  open: boolean;
  onClose: () => void;
  /** The still-unassigned rows the selection would dismiss — already filtered by `dismissableRows`. */
  rows: readonly DisplayRow[];
  systemNames: ReadonlyMap<number, string>;
  /** Live Jita valuation of a row's unassigned residual — the route's own `estimatedValueOf`. */
  estimatedValueOf: (row: DisplayRow) => number;
  showCharacter: boolean;
  onDismissed: () => void;
}

/**
 * Confirms a bulk Dismiss (issue #539) — "I don't pay tax on these entries".
 *
 * Itemized with tick/untick and a running total, the same rule settle-up
 * established: never a blind mark-all. Dismissal is the one bulk action with no
 * Payee and no ISK figure to sanity-check afterwards, so this list is the only
 * place a mis-click gets caught.
 */
export function BulkDismissDialog({
  open,
  onClose,
  rows,
  systemNames,
  estimatedValueOf,
  showCharacter,
  onDismissed,
}: BulkDismissDialogProps) {
  const { t } = useTranslation();
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const included = useMemo(() => rows.filter((dr) => !excluded.has(dr.key)), [rows, excluded]);
  const total = included.reduce((sum, dr) => sum + estimatedValueOf(dr), 0);

  const systemName = (solarSystemId: number) =>
    systemNames.get(solarSystemId) ?? `#${String(solarSystemId)}`;

  function toggle(key: string) {
    setExcluded((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function commit() {
    if (included.length === 0) return;
    setSaving(true);
    try {
      await dismissEntries(
        included.map((dr) => ({
          characterId: dr.row.characterId,
          date: dr.row.entry.date,
          solarSystemId: dr.row.entry.solarSystemId,
          oreLines: dr.row.unassignedOreLines,
          estimatedValue: estimatedValueOf(dr),
        }))
      );
      onDismissed();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('miningTax.bulkDismissTitle')}>
      <div className="space-y-3 text-sm">
        <p className="text-xs text-text-dim">{t('miningTax.bulkDismissHint')}</p>

        <ul className="divide-y divide-line rounded-xs border border-line bg-panel-2">
          {rows.map((dr) => {
            const on = !excluded.has(dr.key);
            return (
              <li key={dr.key}>
                <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(dr.key)}
                    aria-label={t('miningTax.bulkDismissIncludeLabel', {
                      date: dr.row.entry.date,
                    })}
                  />
                  <span className="w-20 shrink-0 tabular-nums">{dr.row.entry.date}</span>
                  <span className="min-w-0 flex-1 truncate text-text-dim">
                    {systemName(dr.row.entry.solarSystemId)}
                    {showCharacter && ` · ${dr.row.characterName}`}
                  </span>
                  <span className={cx('shrink-0 tabular-nums', !on && 'text-text-faint')}>
                    {formatIsk(estimatedValueOf(dr), 2)} ISK
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[0.6875rem] text-text-dim">
            {t('miningTax.bulkDismissIncluded', { count: included.length })}
          </span>
          <span className="text-sm font-semibold tabular-nums">{formatIsk(total, 2)} ISK</span>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant="primary"
            size="sm"
            disabled={included.length === 0 || saving}
            onClick={() => void commit()}
          >
            {t('miningTax.bulkDismissConfirmAction', { count: included.length })}
          </Button>
          <Button size="sm" onClick={onClose}>
            {t('filters.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
