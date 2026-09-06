import { useTranslation } from 'react-i18next';
import { Button, Modal, StatChip } from '@/components/ui';
import { SecurityValue } from '@/features/character/assetBrowserRows';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { STATUS_LABEL_KEY, type MiningTaxRowStatus } from '@/engine/miningTax/rowStatus';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { formatIsk } from '@/lib/isk';
import { AssignDialog } from './AssignDialog';
import { STATUS_TONE } from './statusTone';
import type { MoonMiningTaxRow } from './snapshot';

interface RowDetailModalProps {
  open: boolean;
  onClose: () => void;
  row: MoonMiningTaxRow;
  assignment: MiningTaxAssignmentRecord | null;
  status: MiningTaxRowStatus;
  systemName: string;
  /** Undefined while still resolving, null when unresolvable — `SecurityValue` renders nothing either way. */
  systemSecurity: number | null | undefined;
  typeNames: ReadonlyMap<number, string>;
  payeeDisplayName: string;
  payees: readonly PayeeRecord[];
  unitPrices: ReadonlyMap<number, number>;
  busy: boolean;
  /** A create or an edit through the Assign form both land here — refresh and close, same as every other action below. */
  onAssigned: () => void;
  onDismiss: () => void;
  onMarkPaid: () => void;
  onResolve: () => void;
  onUndo: () => void;
}

/**
 * Row detail (issue #523): clicking any row opens this instead of hunting
 * for an icon in a dense table. Every status but Dismissed gets the full
 * Assign/edit form (`AssignDialog`) inline — pre-filled from the existing
 * Assignment when there is one — so "view what this row is" and "change it"
 * are the same click, not a read-only stop followed by a second dialog.
 * Dismissed stays read-only (no Payee to edit): its only move is Undo.
 */
export function RowDetailModal({
  open,
  onClose,
  row,
  assignment,
  status,
  systemName,
  systemSecurity,
  typeNames,
  payeeDisplayName,
  payees,
  unitPrices,
  busy,
  onAssigned,
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
  // The Assign form already shows ore lines interactively (with split
  // checkboxes) whenever it's creating a new Assignment across more than one
  // line — showing the same lines again as a plain list just above it would
  // be pure duplication.
  const showOreCard = status !== 'unassigned' || oreLines.length <= 1;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('miningTax.detailTitle', { date: row.entry.date, system: systemName })}
    >
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div>
            <p>
              <span className="text-text-dim">{row.characterName}</span>
              <span className="mx-1.5 text-text-faint">·</span>
              <span className="font-medium">{payeeDisplayName}</span>
            </p>
            <span className="flex items-center gap-1.5 text-xs text-text-dim">
              {systemName}
              <SecurityValue security={systemSecurity} t={t} />
            </span>
          </div>
          <StatChip
            label={t('miningTax.statusColumn')}
            value={t(`miningTax.status.${STATUS_LABEL_KEY[status]}`)}
            tone={STATUS_TONE[status]}
          />
        </div>

        {status === 'dismissed' && (
          <div className="flex flex-wrap gap-2">
            <StatChip
              label={t('miningTax.estimatedValueColumn')}
              value={`${formatIsk(estimatedValue, 2)} ISK`}
            />
          </div>
        )}

        {showOreCard && (
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
        )}

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

        {status === 'dismissed' ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" disabled={busy} onClick={onUndo}>
              {t('miningTax.undismissAction')}
            </Button>
            <Button size="sm" onClick={onClose}>
              {t('filters.cancel')}
            </Button>
          </div>
        ) : (
          <AssignDialog
            row={row}
            assignment={assignment}
            payees={payees}
            systemName={systemName}
            typeNames={typeNames}
            unitPrices={unitPrices}
            busy={busy}
            onAssigned={onAssigned}
            onCancel={onClose}
            extraActions={
              status === 'unassigned' ? (
                <Button size="sm" disabled={busy} onClick={onDismiss}>
                  {t('miningTax.dismissAction')}
                </Button>
              ) : status === 'outstanding' ? (
                <Button size="sm" disabled={busy} onClick={onMarkPaid}>
                  {t('miningTax.markPaidAction')}
                </Button>
              ) : status === 'needs-review' ? (
                <Button size="sm" disabled={busy} onClick={onResolve}>
                  {t('miningTax.resolveConfirm')}
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
    </Modal>
  );
}
