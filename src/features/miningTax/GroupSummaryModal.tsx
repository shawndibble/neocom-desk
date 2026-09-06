import { useTranslation } from 'react-i18next';
import { Button, Modal, StatChip } from '@/components/ui';
import { SecurityValue } from '@/features/character/assetBrowserRows';
import type { MiningTaxAssignmentRecord } from '@/db';
import { STATUS_LABEL_KEY } from '@/engine/miningTax/rowStatus';
import { formatIsk } from '@/lib/isk';
import { STATUS_TONE } from './statusTone';
import type { MoonMiningTaxRow } from './snapshot';

export interface GroupMember {
  row: MoonMiningTaxRow;
  assignment: MiningTaxAssignmentRecord;
}

interface GroupSummaryModalProps {
  open: boolean;
  onClose: () => void;
  /** 2+ Assignments joined into one obligation (issue #523), earliest date first. */
  members: readonly GroupMember[];
  systemName: string;
  systemSecurity: number | null | undefined;
  typeNames: ReadonlyMap<number, string>;
  payeeDisplayName: string;
  busy: boolean;
  /** Opens the ordinary single-Assignment editor (`RowDetailModal`) for one member — the only place a joined group's figures are actually corrected. */
  onEditMember: (member: GroupMember) => void;
  onMarkAllPaid: () => void;
}

/**
 * Read-only overview of a joined group (issue #523's "join entries"): a date
 * range title, one row per member (its own date, ore, value, tax owed,
 * status), and a combined total — exactly the shape the user asked for when
 * a moon-mining session spans midnight UTC and shows up as two ledger
 * entries. Editing a member's Payee/tax%/value stays a single-Assignment
 * operation (`onEditMember` → `RowDetailModal`), never a blended edit across
 * dates — see the decision doc.
 */
export function GroupSummaryModal({
  open,
  onClose,
  members,
  systemName,
  systemSecurity,
  typeNames,
  payeeDisplayName,
  busy,
  onEditMember,
  onMarkAllPaid,
}: GroupSummaryModalProps) {
  const { t } = useTranslation();
  const dates = members.map((m) => m.row.entry.date);
  const totalTaxOwed = members.reduce((sum, m) => sum + m.assignment.taxOwed, 0);
  const totalValue = members.reduce((sum, m) => sum + m.assignment.estimatedValue, 0);
  const anyOutstanding = members.some((m) => m.assignment.status === 'outstanding');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-1.5">
          {t('miningTax.detailTitle', {
            date: `${dates[0]} – ${dates[dates.length - 1]}`,
            system: systemName,
          })}
          <SecurityValue security={systemSecurity} t={t} />
        </span>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="text-text-dim">{payeeDisplayName}</span>
          <span className="text-lg font-medium tabular-nums">{formatIsk(totalTaxOwed, 2)} ISK</span>
        </div>

        <ul className="space-y-2">
          {members.map((member) => (
            <li
              key={member.assignment.id}
              className="space-y-1 rounded-xs border border-line bg-panel-2 p-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{member.row.entry.date}</span>
                <StatChip
                  label={t('miningTax.statusColumn')}
                  value={t(`miningTax.status.${STATUS_LABEL_KEY[member.assignment.status]}`)}
                  tone={STATUS_TONE[member.assignment.status]}
                />
              </div>
              <ul className="divide-y divide-line text-xs">
                {member.assignment.oreLines.map((line) => (
                  <li key={line.typeId} className="flex items-center justify-between py-1">
                    <span className="min-w-0 truncate">
                      {typeNames.get(line.typeId) ?? `#${line.typeId}`}
                    </span>
                    <span className="tabular-nums text-text-dim">
                      {line.quantity.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-text-dim">
                <span>
                  {formatIsk(member.assignment.estimatedValue, 2)} ISK ·{' '}
                  {formatIsk(member.assignment.taxOwed, 2)} ISK {t('miningTax.taxOwedColumn')}
                </span>
                <Button size="sm" onClick={() => onEditMember(member)}>
                  {t('miningTax.editMemberAction')}
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <p className="text-[0.6875rem] text-text-dim">
          {t('miningTax.groupTotalValueLabel', { value: `${formatIsk(totalValue, 2)} ISK` })}
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          {anyOutstanding && (
            <Button variant="primary" size="sm" disabled={busy} onClick={onMarkAllPaid}>
              {t('miningTax.markGroupPaidAction')}
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
