import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { Contract } from '@/esi/endpoints';
import { courierDeliveryDeadlineMs } from '@/engine/contracts/courierDeadline';
import { contractIssuer, contractReceiver } from './contractCounterparty';
import { contractAmount } from './contractAmount';
import { CONTRACT_STATUS_KEY, CONTRACT_TYPE_KEY } from './contractLabels';

/**
 * CSV columns for contracts, every fact the History table holds whichever
 * columns the picker shows: type (the table's label, not the ESI slug), title,
 * character, status (the table's label), issuer, receiver, price, issued,
 * expires, collateral, and for a courier its start and end location ids and
 * its delivery deadline (an accepted courier's own clock, distinct from the
 * accept-by Expires). Dates pass through as raw ISO strings; `price` is the
 * type-aware `contractAmount` like the table, blank (not a string) when
 * neither price nor reward is present. Location names resolve per row off
 * ESI, so a file carries ids rather than fire a lookup per contract.
 */
export function contractsCsvColumns(
  t: CsvTranslate,
  nameFor: (issuerId: number) => string,
  selfId?: number | ((contract: Contract) => number | undefined),
  /** Who the contract belongs to: the All characters column, or the single owner's name. */
  characterNameFor?: (contract: Contract) => string | null
): CsvColumn<Contract>[] {
  return [
    { header: t('contracts.type'), value: (contract) => t(CONTRACT_TYPE_KEY[contract.type]) },
    { header: t('contracts.csvTitle'), value: (contract) => contract.title || null },
    ...(characterNameFor
      ? [{ header: t('contracts.character'), value: (c: Contract) => characterNameFor(c) }]
      : []),
    { header: t('contracts.status'), value: (contract) => t(CONTRACT_STATUS_KEY[contract.status]) },
    { header: t('contracts.issuer'), value: (contract) => nameFor(contractIssuer(contract).id) },
    {
      header: t('contracts.receiver'),
      value: (contract) => {
        const self = typeof selfId === 'function' ? selfId(contract) : selfId;
        const receiver = self === undefined ? null : contractReceiver(contract, self);
        return receiver ? nameFor(receiver.id) : null;
      },
    },
    {
      header: t('contracts.price'),
      value: (contract) => contractAmount(contract) ?? null,
    },
    { header: t('contracts.csvCollateral'), value: (contract) => contract.collateral ?? null },
    { header: t('contracts.issued'), value: (contract) => contract.date_issued },
    { header: t('contracts.expires'), value: (contract) => contract.date_expired },
    {
      header: t('contracts.csvCourierStart'),
      value: (contract) =>
        contract.type === 'courier' ? (contract.start_location_id ?? null) : null,
    },
    {
      header: t('contracts.csvCourierEnd'),
      value: (contract) =>
        contract.type === 'courier' ? (contract.end_location_id ?? null) : null,
    },
    {
      header: t('contracts.csvCourierDeadline'),
      value: (contract) => {
        const deadline = courierDeliveryDeadlineMs(contract);
        return deadline === null ? null : new Date(deadline).toISOString();
      },
    },
  ];
}
