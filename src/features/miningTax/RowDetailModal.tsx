import { useTranslation } from 'react-i18next';
import { Button, Modal, StatChip, type StatChipTone } from '@/components/ui';
import type { MiningTaxAssignmentRecord } from '@/db';
import { STATUS_LABEL_KEY, type MiningTaxRowStatus } from '@/engine/miningTax/rowStatus';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { formatIsk } from '@/lib/isk';
import type { MoonMiningTaxRow } from './snapshot';

/** Mirrors the tone conventions elsewhere (`Clones.tsx`, `PlanetaryIndustry.tsx`): `danger` for money still owed, `success` once paid, `warning` for a state needing a decision, `default` for anything settled or not-yet-decided. */
const STATUS_TONE: Record<MiningTaxRowStatus, StatChipTone> = {
  unassigned: 'default',
  outstanding: 'danger',
  'needs-review': 'warning',
  paid: 'success',
  dismissed: 'default',
};

interface RowDetailModalProps {
  open: boolean;
  onClose: () => void;
  row: MoonMiningTaxRow;
  assignment: MiningTaxAssignmentRecord | null;
  status: MiningTaxRowStatus;
  systemName: string;
  typeNames: ReadonlyMap<number, string>;
  payeeDisplayName: string;
  unitPrices: ReadonlyMap<number, number>;
  busy: boolean;
  onAssign: () => void;
  onDismiss: () => void;
  onMarkPaid: () => void;
  onResolve: () => void;
  onUndo: () => void;
}

/**
 * Row detail (issue #523): clicking any row opens this instead of hunting
 * for an icon in a dense table — every ore line by name and quantity, the
 * Payee and tax breakdown, and whichever action that status can take next,
 * all in one place. Replaces the table's own per-row action buttons entirely.
 */
export function RowDetailModal({
  open,
  onClose,
  row,
  assignment,
  status,
  systemName,
  typeNames,
  payeeDisplayName,
  unitPrices,
  busy,
  onAssign,
  onDismiss,
  onMarkPaid,
  onResolve,
  onUndo,
}: RowDetailModalProps) {
  const { t } = useTranslation();
  const oreLines = assignment ? assignment.oreLines : row.unassignedOreLines;
  const estimatedValue = assignment
    ? assignment.estimatedValue
    : computeAssignmentValue(oreLines, unitPrices, 0).estimatedValue;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('miningTax.detailTitle', { date: row.entry.date, system: systemName })}
    >
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p>
            <span className="text-text-dim">{row.characterName}</span>
            <span className="mx-1.5 text-text-faint">·</span>
            <span className="font-medium">{payeeDisplayName}</span>
          </p>
          <StatChip
            label={t('miningTax.statusColumn')}
            value={t(`miningTax.status.${STATUS_LABEL_KEY[status]}`)}
            tone={STATUS_TONE[status]}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {assignment && (
            <StatChip label={t('miningTax.taxPctLabel')} value={`${assignment.taxPct}%`} />
          )}
          <StatChip
            label={t('miningTax.estimatedValueColumn')}
            value={`${formatIsk(estimatedValue, 2)} ISK`}
          />
          {assignment && (
            <StatChip
              label={t('miningTax.taxOwedColumn')}
              value={`${formatIsk(assignment.taxOwed, 2)} ISK`}
              tone={status === 'outstanding' ? 'danger' : status === 'paid' ? 'success' : 'default'}
            />
          )}
        </div>

        <div className="space-y-1 rounded-xs border border-line bg-panel-2 p-2">
          <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('miningTax.oreColumn')}
          </p>
          <ul className="space-y-0.5 text-xs">
            {oreLines.map((line) => (
              <li key={line.typeId} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  {typeNames.get(line.typeId) ?? `#${line.typeId}`}
                </span>
                <span className="shrink-0 tabular-nums text-text-dim">
                  {line.quantity.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {status === 'needs-review' && assignment?.reviewDiff && (
          <div className="space-y-1 rounded-xs border border-warning/60 bg-warning/10 p-2 text-xs">
            <p className="font-semibold text-warning uppercase">{t('miningTax.resolveTitle')}</p>
            <p className="text-text-dim">{t('miningTax.resolveHint')}</p>
            <ul className="space-y-1">
              {assignment.reviewDiff.map((diff) => (
                <li key={diff.typeId} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {typeNames.get(diff.typeId) ?? `#${diff.typeId}`}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {diff.before.toLocaleString()} → {diff.after.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {status === 'unassigned' && (
            <>
              <Button variant="primary" size="sm" onClick={onAssign}>
                {t('miningTax.assignAction')}
              </Button>
              <Button size="sm" onClick={onDismiss}>
                {t('miningTax.dismissAction')}
              </Button>
            </>
          )}
          {status === 'outstanding' && (
            <Button variant="primary" size="sm" disabled={busy} onClick={onMarkPaid}>
              {t('miningTax.markPaidAction')}
            </Button>
          )}
          {status === 'needs-review' && (
            <Button variant="primary" size="sm" disabled={busy} onClick={onResolve}>
              {t('miningTax.resolveConfirm')}
            </Button>
          )}
          {status === 'dismissed' && (
            <Button size="sm" disabled={busy} onClick={onUndo}>
              {t('miningTax.undismissAction')}
            </Button>
          )}
          <Button size="sm" onClick={onClose}>
            {t('filters.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
