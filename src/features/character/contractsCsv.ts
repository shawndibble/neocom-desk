import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { Contract } from '@/esi/endpoints';
import type { EffectiveStanding } from './contactStandings';
import { standingLabel } from './standingLabel';
import { courierDeliveryDeadlineMs } from '@/engine/contracts/courierDeadline';
import { isoTime } from '@/lib/exportSheets';
import { contractIssuer, contractReceiver } from './contractCounterparty';
import { contractAmount } from './contractAmount';
import { CONTRACT_STATUS_KEY, CONTRACT_TYPE_KEY } from './contractLabels';

export interface ContractsCsvOptions {
  nameFor: (issuerId: number) => string;
  /** The party a row is read relative to (for the receiver); undefined when unknown. */
  selfId?: number | ((contract: Contract) => number | undefined);
  /** Who the contract belongs to. Omit where the view has no character owner (the corporation's), so no always-empty column. */
  characterNameFor?: (contract: Contract) => string | null;
  /** The standing tag the table puts beside a character issuer or receiver. */
  standingFor?: (contract: Contract, id: number) => EffectiveStanding | null;
  /** A resolved station or structure name; null while unresolved (the ID columns stay). */
  locationName?: (locationId: number) => string | null;
  /** The buyback Quote request a contract answers (the table's Community cue), as words. */
  buybackFor?: (contract: Contract) => string | null;
}

/**
 * CSV columns for the History table, every column whichever the picker shows, plus the
 * facts it keeps in cells and cues. Dates are raw ISO; a courier's delivery deadline is its
 * own clock, distinct from the accept-by Expires; location names fill in as they resolve.
 */
export function contractsCsvColumns(
  t: CsvTranslate,
  { nameFor, selfId, characterNameFor, standingFor, locationName, buybackFor }: ContractsCsvOptions
): CsvColumn<Contract>[] {
  const receiverOf = (contract: Contract) => {
    const self = typeof selfId === 'function' ? selfId(contract) : selfId;
    return self === undefined ? null : contractReceiver(contract, self);
  };
  /** The standing tag's words for a party; only a character carries one. */
  const standingOf = (contract: Contract, party: { id: number; kind: string } | null) =>
    party?.kind === 'character' && standingFor
      ? standingLabel(t, standingFor(contract, party.id))
      : null;
  const courierPlace = (contract: Contract, id: number | undefined) =>
    contract.type === 'courier' && id ? id : null;
  const placeNameOf = (contract: Contract, id: number | undefined) => {
    const place = courierPlace(contract, id);
    return place === null ? null : (locationName?.(place) ?? null);
  };
  return [
    { header: t('contracts.type'), value: (contract) => t(CONTRACT_TYPE_KEY[contract.type]) },
    { header: t('contracts.csvTitle'), value: (contract) => contract.title || null },
    ...(characterNameFor
      ? [{ header: t('contracts.character'), value: (c: Contract) => characterNameFor(c) }]
      : []),
    { header: t('contracts.status'), value: (contract) => t(CONTRACT_STATUS_KEY[contract.status]) },
    { header: t('contracts.issuer'), value: (contract) => nameFor(contractIssuer(contract).id) },
    {
      header: t('contracts.csvIssuerStanding'),
      value: (contract) => standingOf(contract, contractIssuer(contract)),
    },
    {
      header: t('contracts.receiver'),
      value: (contract) => {
        const receiver = receiverOf(contract);
        return receiver ? nameFor(receiver.id) : null;
      },
    },
    {
      header: t('contracts.csvReceiverStanding'),
      value: (contract) => standingOf(contract, receiverOf(contract)),
    },
    {
      header: t('contracts.price'),
      value: (contract) => contractAmount(contract) ?? null,
    },
    { header: t('contracts.csvCollateral'), value: (contract) => contract.collateral ?? null },
    { header: t('contracts.issued'), value: (contract) => contract.date_issued },
    { header: t('contracts.expires'), value: (contract) => contract.date_expired },
    { header: t('contracts.csvBuyback'), value: (contract) => buybackFor?.(contract) ?? null },
    {
      header: t('contracts.csvCourierStartName'),
      value: (contract) => placeNameOf(contract, contract.start_location_id),
    },
    {
      header: t('contracts.csvCourierEndName'),
      value: (contract) => placeNameOf(contract, contract.end_location_id),
    },
    {
      header: t('contracts.csvCourierStart'),
      value: (contract) => courierPlace(contract, contract.start_location_id),
    },
    {
      header: t('contracts.csvCourierEnd'),
      value: (contract) => courierPlace(contract, contract.end_location_id),
    },
    {
      header: t('contracts.csvCourierDeadline'),
      value: (contract) => isoTime(courierDeliveryDeadlineMs(contract)),
    },
  ];
}
