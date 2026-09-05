import { useTranslation } from 'react-i18next';
import { Button, DataTable, Modal, type DataTableColumn } from '@/components/ui';
import type { MiningTaxAssignmentRecord } from '@/db';
import { formatIsk } from '@/lib/isk';
import { markAssignmentsPaid } from './assignments';

interface BulkPayRow {
  assignment: MiningTaxAssignmentRecord;
  characterName: string;
  payeeName: string;
}

interface BulkPayConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  rows: readonly BulkPayRow[];
  onPaid: () => void;
}

/**
 * Itemized confirmation before bulk-paying several Outstanding Assignments
 * (decision doc) — payee/character/date/total, never a single blind "mark
 * all as paid" click.
 */
export function BulkPayConfirmDialog({ open, onClose, rows, onPaid }: BulkPayConfirmDialogProps) {
  const { t } = useTranslation();
  const total = rows.reduce((sum, row) => sum + row.assignment.taxOwed, 0);

  const columns: DataTableColumn<BulkPayRow>[] = [
    { id: 'character', header: t('miningTax.characterColumn'), render: (r) => r.characterName },
    {
      id: 'date',
      header: t('miningTax.dateColumn'),
      render: (r) => r.assignment.date,
      primary: true,
    },
    { id: 'payee', header: t('miningTax.payeeColumn'), render: (r) => r.payeeName },
    {
      id: 'taxOwed',
      header: t('miningTax.taxOwedColumn'),
      align: 'right',
      render: (r) => `${formatIsk(r.assignment.taxOwed, 2)} ISK`,
    },
  ];

  async function handleConfirm() {
    await markAssignmentsPaid(rows.map((r) => r.assignment));
    onPaid();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('miningTax.bulkPayTitle', { count: rows.length })}
    >
      <div className="space-y-3">
        <div className="overflow-x-auto">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.assignment.id}
            label={t('miningTax.bulkPayTitle', { count: rows.length })}
            density="compact"
          />
        </div>
        <p className="text-sm font-semibold">
          {t('miningTax.bulkPayTotal')}: {formatIsk(total, 2)} ISK
        </p>
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" onClick={() => void handleConfirm()}>
            {t('miningTax.bulkPayConfirm')}
          </Button>
          <Button className="flex-1" onClick={onClose}>
            {t('filters.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
