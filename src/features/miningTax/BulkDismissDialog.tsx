import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, Checkbox, Tooltip } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import type { DisplayRow } from './groupRows';
import { dismiss } from './ledgerActions';
import { systemLabel } from './names';
import { useLedgerAction } from './useLedgerAction';
import { LedgerActionError } from './LedgerActionError';
import { toggleInSet } from '@/lib/sets';
import { DividedList } from '@/components/ui/DividedList';

interface BulkDismissDialogProps {
  open: boolean;
  onClose: () => void;
  rows: readonly DisplayRow[];
  systemNames: ReadonlyMap<number, string>;
  estimatedValueOf: (row: DisplayRow) => number;
  showCharacter: boolean;
  onDismissed: () => void;
}

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
  const { pending: saving, error: saveError, run } = useLedgerAction();

  const included = useMemo(() => rows.filter((dr) => !excluded.has(dr.key)), [rows, excluded]);
  const total = included.reduce((sum, dr) => sum + estimatedValueOf(dr), 0);

  const systemName = (solarSystemId: number) => systemLabel(systemNames, solarSystemId);

  function toggle(key: string) {
    setExcluded((previous) => toggleInSet(previous, key));
  }

  async function commit() {
    if (included.length === 0) return;
    await run(
      () =>
        dismiss(
          included.map((dr) => ({
            characterId: dr.row.characterId,
            date: dr.row.entry.date,
            solarSystemId: dr.row.entry.solarSystemId,
            oreLines: dr.row.unassignedOreLines,
            estimatedValue: estimatedValueOf(dr),
          }))
        ),
      () => {
        onDismissed();
        onClose();
      }
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissOnOutsidePress={false}
      title={t('miningTax.bulkDismissTitle')}
    >
      <div className="space-y-3 text-sm">
        <p className="text-xs text-text-dim">{t('miningTax.bulkDismissHint')}</p>

        <DividedList as="ul">
          {rows.map((dr) => {
            const on = !excluded.has(dr.key);
            return (
              <li key={dr.key}>
                <label
                  className={cx(
                    'flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs',
                    tappableRowClassName
                  )}
                >
                  <Checkbox
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
                  <span className={cx('shrink-0 tabular-nums', !on && 'text-text-dim')}>
                    {formatIsk(estimatedValueOf(dr))} ISK
                  </span>
                </label>
              </li>
            );
          })}
        </DividedList>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[0.6875rem] text-text-dim">
            {t('miningTax.bulkDismissIncluded', { count: included.length })}
          </span>
          <span className="text-sm font-semibold tabular-nums">{formatIsk(total)} ISK</span>
        </div>

        <LedgerActionError error={saveError} />
        <div className="flex flex-wrap gap-2 pt-1">
          <Tooltip content={included.length === 0 ? t('common.nothingSelected') : null}>
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              aria-disabled={included.length === 0 || undefined}
              onClick={() => void commit()}
            >
              {t('miningTax.bulkDismissConfirmAction', { count: included.length })}
            </Button>
          </Tooltip>
          <Button size="sm" onClick={onClose}>
            {t('filters.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
