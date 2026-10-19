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
  activeCharacterId: number | null;
  issuerNames: ReadonlyMap<number, string>;
  receiverCategories: ReadonlyMap<number, NameCategory>;
  standingIndex: ContactStandingIndex;
  issuerAffiliations: ReadonlyMap<number, CharacterAffiliation>;
  /** Opens the detail modal from the identity column. */
  onOpen: (contract: Contract) => void;
}

/**
 * The History table's columns: the identity column (never hidden — it opens
 * the detail modal) plus the optional ones the picker controls, in
 * `CONTRACTS_HISTORY_COLUMN_IDS` order.
 */
export function useContractsHistoryColumns({
  activeCharacterId,
  issuerNames,
  receiverCategories,
  standingIndex,
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
    (contract: Contract) =>
      activeCharacterId === null
        ? null
        : contractReceiver(contract, activeCharacterId, receiverCategories),
    [activeCharacterId, receiverCategories]
  );
  const optionalColumns = useMemo<Record<ContractsHistoryColumnId, DataTableColumn<Contract>>>(
    () => ({
      status: {
        id: 'status',
        header: t('contracts.status'),
        className: 'font-semibold',
        cellClassName: (contract) => STATUS_TONE[contract.status],
        sortValue: (contract) => t(CONTRACT_STATUS_KEY[contract.status]),
        render: (contract) => <ContractStatusCell contract={contract} />,
      },
      issuer: {
        id: 'issuer',
        header: t('contracts.issuer'),
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
                <StandingTag
                  standing={characterStanding(standingIndex, issuer.id, issuerAffiliations)}
                />
              )}
            </span>
          );
        },
      },
      receiver: {
        id: 'receiver',
        header: t('contracts.receiver'),
        sortValue: (contract) => {
          const receiver = receiverFor(contract);
          return receiver ? (issuerNames.get(receiver.id) ?? `#${receiver.id}`) : '';
        },
        render: (contract) => {
          const receiver = receiverFor(contract);
          // No receiver (a public contract nobody took): the phone card's meta
          // line leaves the placeholder dash off rather than print a bare "—".
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
              standing={
                receiver?.kind === 'character'
                  ? characterStanding(standingIndex, receiver.id, issuerAffiliations)
                  : null
              }
            />
          );
        },
      },
      price: {
        id: 'price',
        header: t('contracts.price'),
        align: 'right',
        className: 'tabular-nums',
        // The dense phone card's headline figure, beside the title.
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
        className: 'whitespace-nowrap text-text-dim',
        sortValue: (contract) => new Date(contract.date_issued).getTime(),
        // Off the phone card: its day section header already says it.
        render: (contract) => (
          <span data-dense-omit>
            <ContractDateCell iso={contract.date_issued} timeZone={timeZone} />
          </span>
        ),
      },
      expires: {
        id: 'expires',
        header: t('contracts.expires'),
        className: 'whitespace-nowrap text-text-dim',
        // An accepted courier's clock is delivery, not the accept-by expiry.
        sortValue: (contract) =>
          courierDeliveryDeadlineMs(contract) ?? new Date(contract.date_expired).getTime(),
        render: (contract) => {
          const deadlineMs = courierDeliveryDeadlineMs(contract);
          if (deadlineMs === null)
            return (
              <span>
                {/* Phone card only: its meta line has no column labels. */}
                <span className="sm:hidden">{t('contracts.expiresAffix')}</span>
                <ContractDateCell iso={contract.date_expired} timeZone={timeZone} />
              </span>
            );
          return <CourierDeadlineCell deadlineMs={deadlineMs} timeZone={timeZone} />;
        },
      },
    }),
    [t, issuerNames, timeZone, standingIndex, issuerAffiliations, receiverFor]
  );
  const columns = useMemo<DataTableColumn<Contract>[]>(
    () => [
      {
        id: 'type',
        header: t('contracts.type'),
        sortValue: (contract) => contract.title || t(CONTRACT_TYPE_KEY[contract.type]),
        render: (contract) => {
          const opener = (
            <button
              type="button"
              onClick={() => onOpen(contract)}
              className={entityLinkClassName(
                cx(
                  'flex min-h-11 w-full items-center text-left font-medium md:block md:min-h-0 md:w-auto',
                  contract.title && 'md:max-w-72 md:truncate'
                )
              )}
            >
              {/* Phone only: the status tone as a dot, so a scan down the card
                  list reads outcome without the Status column (which the
                  picker can hide). The word stays on the meta line. */}
              <span
                aria-hidden="true"
                className={cx(
                  'mr-2 size-2 shrink-0 rounded-full bg-current sm:hidden',
                  STATUS_TONE[contract.status]
                )}
              />
              <ContractIdentity contract={contract} characterId={activeCharacterId} />
            </button>
          );
          // A title is the only free-text (so truncatable) identity; the full
          // text reaches the tooltip on hover and touch-and-hold.
          return contract.title ? <Tooltip content={contract.title}>{opener}</Tooltip> : opener;
        },
      },
      ...CONTRACTS_HISTORY_COLUMN_IDS.filter(columnVisibility.isVisible).map(
        (id) => optionalColumns[id]
      ),
    ],
    [t, optionalColumns, columnVisibility.isVisible, activeCharacterId, onOpen]
  );

  return { columns, optionalColumns, columnVisibility, receiverFor };
}
