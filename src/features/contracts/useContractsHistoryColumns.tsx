import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { IskAmount, Tooltip, type DataTableColumn } from '@/components/ui';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { cx } from '@/lib/cx';
import { useTimeZone } from '@/lib/timeFormat';
import { courierDeliveryDeadlineMs } from '@/engine/contracts/courierDeadline';
import type { CharacterAffiliation, Contract } from '@/esi/endpoints';
import { CharacterLink, CorporationLink } from '@/features/entities';
import { contractAmount } from '@/features/character/contractAmount';
import { contractIssuer, contractReceiver } from '@/features/character/contractCounterparty';
import { ContractIdentity } from '@/features/character/ContractIdentity';
import { ContractReceiverLink } from '@/features/character/ContractReceiverLink';
import { CONTRACT_STATUS_KEY, CONTRACT_TYPE_KEY } from '@/features/character/contractLabels';
import type { ContactStandingIndex } from '@/features/character/contactStandings';
import { characterStanding } from '@/features/character/entityStanding';
import type { NameCategory } from '@/features/character/names';
import { StandingTag } from '@/features/character/StandingTag';
import {
  CONTRACTS_HISTORY_COLUMN_IDS,
  contractsHistoryColumnsStore,
  type ContractsHistoryColumnId,
} from './contractsColumns';
import { ContractDateCell, ContractStatusCell, CourierDeadlineCell } from './ContractCells';

const STATUS_TONE: Record<Contract['status'], string> = {
  outstanding: 'text-text',
  in_progress: 'text-warning',
  finished_issuer: 'text-success',
  finished_contractor: 'text-success',
  finished: 'text-success',
  cancelled: 'text-text-dim',
  rejected: 'text-danger',
  failed: 'text-danger',
  deleted: 'text-text-dim',
  reversed: 'text-danger',
};

interface Options {
  ownerOf: (contract: Contract) => number | null;
  standingIndexFor: (ownerId: number) => ContactStandingIndex;
  characterNameOf: ((contract: Contract) => string) | null;
  issuerNames: ReadonlyMap<number, string>;
  receiverCategories: ReadonlyMap<number, NameCategory>;
  issuerAffiliations: ReadonlyMap<number, CharacterAffiliation>;
  onOpen: (contract: Contract) => void;
}

export function useContractsHistoryColumns({
  ownerOf,
  standingIndexFor,
  characterNameOf,
  issuerNames,
  receiverCategories,
  issuerAffiliations,
  onOpen,
}: Options) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const columnVisibility = useColumnVisibility(
    contractsHistoryColumnsStore,
    CONTRACTS_HISTORY_COLUMN_IDS
  );

  const receiverFor = useCallback(
    (contract: Contract) => {
      const owner = ownerOf(contract);
      return owner === null ? null : contractReceiver(contract, owner, receiverCategories);
    },
    [ownerOf, receiverCategories]
  );
  const standingFor = useCallback(
    (contract: Contract, id: number) => {
      const owner = ownerOf(contract);
      return characterStanding(
        owner === null ? new Map() : standingIndexFor(owner),
        id,
        issuerAffiliations
      );
    },
    [ownerOf, standingIndexFor, issuerAffiliations]
  );
  const optionalColumns = useMemo<Record<ContractsHistoryColumnId, DataTableColumn<Contract>>>(
    () => ({
      type: {
        id: 'type',
        header: t('contracts.type'),
        width: '16ch',
        className: 'whitespace-nowrap',
        sortValue: (contract) => t(CONTRACT_TYPE_KEY[contract.type]),
        render: (contract) => <span data-dense-omit>{t(CONTRACT_TYPE_KEY[contract.type])}</span>,
      },
      status: {
        id: 'status',
        header: t('contracts.status'),
        width: '24ch',
        className: 'font-semibold whitespace-nowrap',
        cellClassName: (contract) => STATUS_TONE[contract.status],
        sortValue: (contract) => t(CONTRACT_STATUS_KEY[contract.status]),
        render: (contract) => <ContractStatusCell contract={contract} />,
      },
      issuer: {
        id: 'issuer',
        header: t('contracts.issuer'),
        width: '24ch',
        className: 'truncate',
        sortValue: (contract) => {
          const { id } = contractIssuer(contract);
          return issuerNames.get(id) ?? `#${id}`;
        },
        render: (contract) => {
          const issuer = contractIssuer(contract);
          const name = issuerNames.get(issuer.id) ?? `#${issuer.id}`;
          return (
            <span className="inline-flex items-center gap-1.5">
              {issuer.kind === 'corporation' ? (
                <CorporationLink id={issuer.id} className="text-left">
                  {name}
                </CorporationLink>
              ) : (
                <CharacterLink id={issuer.id} className="text-left">
                  {name}
                </CharacterLink>
              )}
              {issuer.kind === 'character' && (
                <StandingTag standing={standingFor(contract, issuer.id)} />
              )}
            </span>
          );
        },
      },
      receiver: {
        id: 'receiver',
        header: t('contracts.receiver'),
        width: '24ch',
        className: 'truncate',
        sortValue: (contract) => {
          const receiver = receiverFor(contract);
          return receiver ? (issuerNames.get(receiver.id) ?? `#${receiver.id}`) : '';
        },
        render: (contract) => {
          const receiver = receiverFor(contract);
          if (receiver === null)
            return (
              <span className="text-text-dim" data-dense-omit>
                —
              </span>
            );
          return (
            <ContractReceiverLink
              receiver={receiver}
              name={receiver ? (issuerNames.get(receiver.id) ?? `#${receiver.id}`) : ''}
              standing={receiver?.kind === 'character' ? standingFor(contract, receiver.id) : null}
            />
          );
        },
      },
      price: {
        id: 'price',
        header: t('contracts.price'),
        align: 'right',
        width: '12ch',
        className: 'tabular-nums whitespace-nowrap',
        cardCorner: true,
        sortValue: (contract) => contractAmount(contract),
        render: (contract) => {
          const amount = contractAmount(contract);
          return amount !== undefined ? <IskAmount value={amount} /> : t('common.unknown');
        },
      },
      issued: {
        id: 'issued',
        header: t('contracts.issued'),
        width: '12ch',
        className: 'whitespace-nowrap text-text-dim',
        sortValue: (contract) => new Date(contract.date_issued).getTime(),
        render: (contract) => (
          <span data-dense-omit>
            <ContractDateCell iso={contract.date_issued} timeZone={timeZone} />
          </span>
        ),
      },
      expires: {
        id: 'expires',
        header: t('contracts.expires'),
        width: '30ch',
        className: 'whitespace-nowrap text-text-dim',
        sortValue: (contract) =>
          courierDeliveryDeadlineMs(contract) ?? new Date(contract.date_expired).getTime(),
        render: (contract) => {
          const deadlineMs = courierDeliveryDeadlineMs(contract);
          if (deadlineMs === null)
            return (
              <span>
                <span className="sm:hidden">{t('contracts.expiresAffix')}</span>
                <ContractDateCell iso={contract.date_expired} timeZone={timeZone} />
              </span>
            );
          return <CourierDeadlineCell deadlineMs={deadlineMs} timeZone={timeZone} />;
        },
      },
    }),
    [t, issuerNames, timeZone, standingFor, receiverFor]
  );
  const columns = useMemo<DataTableColumn<Contract>[]>(
    () => [
      {
        id: 'contract',
        header: t('contracts.contract'),
        className: 'truncate',
        sortValue: (contract) => contract.title || t(CONTRACT_TYPE_KEY[contract.type]),
        render: (contract) => {
          const opener = (
            <button
              type="button"
              onClick={() => onOpen(contract)}
              className={entityLinkClassName(
                cx(
                  'flex min-h-9 w-full items-center text-left font-medium md:block md:min-h-0 md:w-auto',
                  contract.title && 'md:max-w-72 md:truncate'
                )
              )}
            >
              <span
                aria-hidden="true"
                className={cx(
                  'mr-2 size-2 shrink-0 rounded-full bg-current sm:hidden',
                  STATUS_TONE[contract.status]
                )}
              />
              <ContractIdentity contract={contract} characterId={ownerOf(contract)} />
            </button>
          );
          return contract.title ? <Tooltip content={contract.title}>{opener}</Tooltip> : opener;
        },
      },
      ...(characterNameOf
        ? [
            {
              id: 'character',
              header: t('contracts.character'),
              width: '20ch',
              className: 'truncate',
              sortValue: characterNameOf,
              render: (contract: Contract) => characterNameOf(contract),
            } satisfies DataTableColumn<Contract>,
          ]
        : []),
      ...CONTRACTS_HISTORY_COLUMN_IDS.filter(columnVisibility.isVisible).map(
        (id) => optionalColumns[id]
      ),
    ],
    [t, optionalColumns, columnVisibility.isVisible, ownerOf, characterNameOf, onOpen]
  );

  return { columns, optionalColumns, columnVisibility, receiverFor, standingFor };
}
