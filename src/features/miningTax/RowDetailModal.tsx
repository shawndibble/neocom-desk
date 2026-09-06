import { useTranslation } from 'react-i18next';
import { Button, InfoTooltip, Modal, StatChip } from '@/components/ui';
import { SecurityValue } from '@/features/character/assetBrowserRows';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { STATUS_LABEL_KEY, type MiningTaxRowStatus } from '@/engine/miningTax/rowStatus';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { typeIconUrl } from '@/lib/eveImages';
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
  payees: readonly PayeeRecord[];
  unitPrices: ReadonlyMap<number, number>;
  busy: boolean;
  /** A create or an edit through the Assign form both land here — refresh and close, same as every other action below. */
  onAssigned: () => void;
  onDismiss: () => void;
  onMarkPaid: () => void;
  onResolve: () => void;
  /** Deletes the Assignment outright — "Undo" on a Dismissed row, "Unassign" on any other assigned one, so a wrong Payee or a mis-split can always be taken back to Unassigned. */
  onUndo: () => void;
  /** Opens `JoinAssignDialog` to fold another same-system entry into this one (issue #523) — offered only for Unassigned/Outstanding rows that aren't already part of a joined group. */
  onJoin?: () => void;
  /** Opens `SplitDialog` to move part of this day's ore to a second Payee — offered for Outstanding/Paid rows that aren't part of a joined group. */
  onSplit?: () => void;
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
  payees,
  unitPrices,
  busy,
  onAssigned,
  onDismiss,
  onMarkPaid,
  onResolve,
  onUndo,
  onJoin,
  onSplit,
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
      title={
        <span className="flex items-center gap-1.5">
          {t('miningTax.detailTitle', { date: row.entry.date, system: systemName })}
          <SecurityValue security={systemSecurity} t={t} />
          <InfoTooltip
            label={t('common.aboutLabel', { label: t('miningTax.dateColumn') })}
            content={t('miningTax.dateEveHint')}
          />
        </span>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="text-text-dim">{row.characterName}</span>
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
            <ul className="divide-y divide-line text-xs">
              {oreLines.map((line) => (
                <li
                  key={line.typeId}
                  className="flex items-center gap-1.5 py-1 first:pt-0 last:pb-0"
                >
                  <img src={typeIconUrl(line.typeId, 32)} alt="" className="h-4 w-4 shrink-0" />
                  <span className="w-40 shrink-0 truncate">
                    {typeNames.get(line.typeId) ?? `#${line.typeId}`}
                  </span>
                  <span className="tabular-nums text-text-dim">
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
              <>
                {status === 'unassigned' && (
                  <Button size="sm" disabled={busy} onClick={onDismiss}>
                    {t('miningTax.dismissAction')}
                  </Button>
                )}
                {status === 'outstanding' && (
                  <Button size="sm" disabled={busy} onClick={onMarkPaid}>
                    {t('miningTax.markPaidAction')}
                  </Button>
                )}
                {status === 'needs-review' && (
                  <Button size="sm" disabled={busy} onClick={onResolve}>
                    {t('miningTax.resolveConfirm')}
                  </Button>
                )}
                {onJoin && (status === 'unassigned' || status === 'outstanding') && (
                  <Button size="sm" disabled={busy} onClick={onJoin}>
                    {t('miningTax.joinAction')}
                  </Button>
                )}
                {onSplit && (status === 'outstanding' || status === 'paid') && (
                  <Button size="sm" disabled={busy} onClick={onSplit}>
                    {t('miningTax.splitAction')}
                  </Button>
                )}
                {assignment && (
                  <Button size="sm" variant="danger" disabled={busy} onClick={onUndo}>
                    {t('miningTax.unassignAction')}
                  </Button>
                )}
              </>
            }
          />
        )}
      </div>
    </Modal>
  );
}
