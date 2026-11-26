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
  selfId?: number | ((contract: Contract) => number | undefined);
  characterNameFor?: (contract: Contract) => string | null;
  standingFor?: (contract: Contract, id: number) => EffectiveStanding | null;
  locationName?: (locationId: number) => string | null;
  buybackFor?: (contract: Contract) => string | null;
}

export function contractsCsvColumns(
  t: CsvTranslate,
  { nameFor, selfId, characterNameFor, standingFor, locationName, buybackFor }: ContractsCsvOptions
): CsvColumn<Contract>[] {
  const receiverOf = (contract: Contract) => {
    const self = typeof selfId === 'function' ? selfId(contract) : selfId;
    return self === undefined ? null : contractReceiver(contract, self);
  };
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
