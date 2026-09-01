import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { Contract } from '@/esi/endpoints';

/**
 * CSV columns for contracts: type, status, issuer, price, expires. Mirrors
 * the DataTable columns on the Contracts page. `expires` passes through as
 * the raw ISO string, not the `toLocaleString()` display rendering. `price`
 * falls back to `reward` like the table does, and is blank (not a string)
 * when neither is present.
 */
export function contractsCsvColumns(
  t: CsvTranslate,
  nameFor: (issuerId: number) => string
): CsvColumn<Contract>[] {
  return [
    { header: t('contracts.type'), value: (contract) => contract.title || contract.type },
    { header: t('contracts.status'), value: (contract) => contract.status },
    { header: t('contracts.issuer'), value: (contract) => nameFor(contract.issuer_id) },
    {
      header: t('contracts.price'),
      value: (contract) => contract.price ?? contract.reward ?? null,
    },
    { header: t('contracts.expires'), value: (contract) => contract.date_expired },
  ];
}
