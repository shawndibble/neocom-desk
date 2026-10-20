/**
 * Contract detail: everything the in-game contract window shows for one
 * contract, mounted only while selected (`EventDetailModal`'s pattern). The
 * summary fields (type, status, issuer, dates, ISK) are already on the
 * `Contract` the caller has in hand, so those render immediately; only the
 * location name(s) and item lines need an ESI round trip, so each gets its
 * own small loading state rather than blocking the whole modal.
 *
 * Labeled from ESI's own fields, not the game's "Buyer Will Pay/Get" framing
 * — that flips depending on which side of the trade this character is on.
 * `price` is what the acceptor pays, `reward` is what the acceptor receives;
 * items split on `is_included` into what the issuer hands over ("Included")
 * vs what the acceptor must supply ("Requested").
 */
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DataTable,
  EmptyState,
  SlideOver,
  Spinner,
  TypeIcon,
  type DataTableColumn,
} from '@/components/ui';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { DataGate } from '@/components/DataGate';
import { loadContractItemsDetailed } from './contractItems';
import { contractItemsCsvColumns } from './contractItemsCsv';
import { loadContractLocationName } from './contractLocationName';
import { loadTypeNames } from './typeNames';
import { loadContractMarketValue, type ContractMarketValue } from './contractMarketValue';
import { ContractMarketValueRow } from '@/features/contracts/ContractMarketValueRow';
import { ContractDescriptionLinks } from '@/features/contracts/ContractDescriptionLinks';
import { CopyContractIdButton } from '@/features/contracts/CopyContractIdButton';
import { OpenInEveButton } from '@/features/openInEve/OpenInEveButton';
import {
  CONTRACT_AVAILABILITY_KEY,
  CONTRACT_STATUS_KEY,
  CONTRACT_TYPE_KEY,
} from './contractLabels';
import { ItemInfoLink } from '@/features/entities';
import { BuildPlanContextMenu } from '@/features/industry/BuildPlanContextMenu';
import { useMarketHub } from '@/features/market/hub';
import { useMutaplasmidLookup } from '@/features/abyssal/mutaplasmidData';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { CharacterLink, CorporationLink, PlaceLink, SystemLink } from '@/features/entities';
import { resolvePlaceSystemId } from '@/features/route/placeSystem';
import { loadSystemName } from './systemSecurity';
import { StandingTag } from './StandingTag';
import { ContractReceiverLink } from './ContractReceiverLink';
import { contractIssuer, type ContractReceiver } from './contractCounterparty';
import type { EffectiveStanding } from './contactStandings';
import { CONTRACT_ISK_CENTS_BELOW, formatIskAuto } from '@/lib/isk';
import { formatTimestamp } from '@/lib/timestamp';
import { courierDeliveryDeadlineMs } from '@/engine/contracts/courierDeadline';
import { useTimeZone } from '@/lib/timeFormat';
import type { Contract, ContractItem } from '@/esi/endpoints';

export interface ContractDetailModalProps {
  characterId: number;
  contract: Contract;
  issuerName: string;
  /** Omitted (not just null) by a caller that hasn't computed one — same as null, no tag renders. */
  issuerStanding?: EffectiveStanding | null;
  /** Who received it (see `contractReceiver`); omitted or null hides the row. */
  receiver?: ContractReceiver | null;
  receiverName?: string;
  receiverStanding?: EffectiveStanding | null;
  onClose: () => void;
}

interface LocationState {
  start: string | null;
  end: string | null;
}

interface SystemRef {
  id: number;
  name: string;
}

/** `end` only for a courier: every other contract type's two ends are the same system. */
interface SystemsState {
  start: SystemRef | null;
  end: SystemRef | null;
}

/**
 * The solar system a contract location sits in, for its Route Safety link;
 * `null` hides the row (no `#id` stand-in). A location whose name did not
 * resolve is one this character cannot see, or ESI is unreachable, so asking
 * again for its system would only repeat the failed lookup.
 */
async function loadLocationSystem(
  characterId: number,
  locationId: number | undefined,
  locationName: string | null
): Promise<SystemRef | null> {
  if (!locationId || locationName === null) return null;
  const id = await resolvePlaceSystemId(locationId, characterId).catch(() => null);
  if (id === null) return null;
  const name = await loadSystemName(id).catch(() => null);
  return name === null ? null : { id, name };
}

interface ItemsState {
  list: ContractItem[];
  typeNames: Map<number, string>;
}

interface MarketValueState {
  included: ContractMarketValue | null;
  requested: ContractMarketValue | null;
}

const HAS_ITEMS = new Set<Contract['type']>(['item_exchange', 'auction']);

export function ContractDetailModal({
  characterId,
  contract,
  issuerName,
  issuerStanding = null,
  receiver = null,
  receiverName = '',
  receiverStanding = null,
  onClose,
}: ContractDetailModalProps) {
  const { t } = useTranslation();
  const issuer = contractIssuer(contract);
  const timeZone = useTimeZone();
  const deliverByMs = courierDeliveryDeadlineMs(contract);
  const hubId = useMarketHub((s) => s.value);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  const isAbyssalType = useMutaplasmidLookup()?.isAbyssalType;
  const [location, setLocation] = useState<LocationState | undefined>(undefined);
  /** `undefined` until resolved; the System rows stay hidden meanwhile rather than spinning. */
  const [systems, setSystems] = useState<SystemsState | undefined>(undefined);
  /** Stays `undefined` forever for a courier/loan contract — `HAS_ITEMS` gates both the fetch and the render, so it's never inspected there. */
  const [items, setItems] = useState<ItemsState | undefined>(undefined);
  /**
   * The item read came back with nothing (no cache and no answer from ESI). That
   * is "couldn't load", not the "no item data" of a contract that has none, so it
   * is kept apart from `items` and offers Retry.
   */
  const [itemsFailed, setItemsFailed] = useState(false);
  const [itemsAttempt, setItemsAttempt] = useState(0);
  /** Only computed for an outstanding contract — see the `Market value` render gate below. */
  const [marketValue, setMarketValue] = useState<MarketValueState | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLocation(undefined);
      setSystems(undefined);
      const [start, end] = await Promise.all([
        contract.start_location_id
          ? loadContractLocationName(characterId, contract.start_location_id)
          : Promise.resolve(null),
        contract.end_location_id
          ? loadContractLocationName(characterId, contract.end_location_id)
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setLocation({ start, end });
      // After the names, not alongside them: the system id comes off the same
      // station/structure row, which the name lookup has just cached.
      const [startSystem, endSystem] = await Promise.all([
        loadLocationSystem(characterId, contract.start_location_id, start),
        contract.type === 'courier'
          ? loadLocationSystem(characterId, contract.end_location_id, end)
          : Promise.resolve(null),
      ]);
      if (!cancelled) setSystems({ start: startSystem, end: endSystem });
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, contract.type, contract.start_location_id, contract.end_location_id]);

  useEffect(() => {
    if (!HAS_ITEMS.has(contract.type)) return;
    let cancelled = false;
    void (async () => {
      setItems(undefined);
      setItemsFailed(false);
      const outcome = await loadContractItemsDetailed(characterId, contract.contract_id);
      if (outcome.result === null) {
        if (cancelled) return;
        // ESI answered 404: this contract has no item lines (it is gone, or never had
        // any), a definite answer that Retry cannot change. Anything else — no
        // answer, a 5xx, a 403 — is "couldn't load" and keeps Retry.
        if (outcome.failureStatus === 404) setItems({ list: [], typeNames: new Map() });
        else setItemsFailed(true);
        return;
      }
      const list = outcome.result.data;
      const typeNames = await loadTypeNames(list.map((item) => item.type_id));
      if (!cancelled) setItems({ list, typeNames });
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, contract.type, contract.contract_id, itemsAttempt]);

  /**
   * Only for an outstanding contract (issue #717) — a finished/cancelled one
   * is history, not a decision a market figure could still inform.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!HAS_ITEMS.has(contract.type) || contract.status !== 'outstanding' || !items) {
        setMarketValue(undefined);
        return;
      }
      const includedItems = items.list.filter((item) => item.is_included);
      const requestedItems = items.list.filter((item) => !item.is_included);
      // A Character's own contract items carry no item id, so an abyssal module
      // here can't be identified to MutaMarket: it shows as not priced, and why.
      const abyssal = isAbyssalType ? { isAbyssalType, characterId: null } : undefined;
      const [included, requested] = await Promise.all([
        loadContractMarketValue(hub, includedItems, items.typeNames, { abyssal }),
        requestedItems.length > 0
          ? loadContractMarketValue(hub, requestedItems, items.typeNames, { abyssal })
          : Promise.resolve(null),
      ]);
      if (!cancelled) setMarketValue({ included, requested });
    })();
    return () => {
      cancelled = true;
    };
  }, [contract.type, contract.status, items, hub, isAbyssalType]);

  const title = t(CONTRACT_TYPE_KEY[contract.type]);

  const included = items?.list.filter((item) => item.is_included) ?? [];
  const requested = items?.list.filter((item) => !item.is_included) ?? [];
  // Built once per render (not once per table) — both Included and Requested share it.
  // Two columns, one of them a bare number: this is the narrow case
  // `responsive="table"` exists for. Stacking would title each card with the
  // item name and then spend a 6.5rem gutter label on "QUANTITY: 744",
  // turning a scannable list into one card per item for no gain.
  const itemColumns: DataTableColumn<ContractItem>[] | undefined = items && [
    {
      id: 'name',
      header: t('contracts.detailItemName'),
      sortValue: (item) => items.typeNames.get(item.type_id) ?? `#${item.type_id}`,
      render: (item) => (
        <ItemInfoLink typeId={item.type_id}>
          <span className="flex items-center gap-1.5">
            <TypeIcon
              typeId={item.type_id}
              size={32}
              width={20}
              height={20}
              className="shrink-0 rounded-xs border border-line"
            />
            {items.typeNames.get(item.type_id) ?? `#${item.type_id}`}
          </span>
        </ItemInfoLink>
      ),
    },
    {
      id: 'quantity',
      header: t('contracts.detailQuantity'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (item) => item.quantity,
      render: (item) => item.quantity.toLocaleString(),
    },
  ];

  return (
    <SlideOver open onClose={onClose} title={title} wide>
      <div className="space-y-4 text-xs">
        <div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-text-dim uppercase">{t('contracts.detailType')}</dt>
            <dd>{t(CONTRACT_TYPE_KEY[contract.type])}</dd>

            <dt className="text-text-dim uppercase">{t('contracts.detailStatus')}</dt>
            <dd>{t(CONTRACT_STATUS_KEY[contract.status])}</dd>

            <dt className="text-text-dim uppercase">{t('contracts.detailIssuedBy')}</dt>
            <dd className="flex items-center gap-1.5">
              {issuer.kind === 'corporation' ? (
                <CorporationLink id={issuer.id}>{issuerName}</CorporationLink>
              ) : (
                <CharacterLink id={issuer.id}>{issuerName}</CharacterLink>
              )}
              <StandingTag standing={issuerStanding} />
            </dd>

            {receiver && (
              <>
                <dt className="text-text-dim uppercase">{t('contracts.detailReceivedBy')}</dt>
                <dd>
                  <ContractReceiverLink
                    receiver={receiver}
                    name={receiverName}
                    standing={receiverStanding}
                  />
                </dd>
              </>
            )}

            <dt className="text-text-dim uppercase">{t('contracts.detailAvailability')}</dt>
            <dd>{t(CONTRACT_AVAILABILITY_KEY[contract.availability])}</dd>

            <dt className="text-text-dim uppercase">{t('contractDetail.contractIdLabel')}</dt>
            <dd className="flex items-center gap-1 tabular-nums">
              {contract.contract_id}
              <CopyContractIdButton contractId={contract.contract_id} />
              <OpenInEveButton kind="contract" id={contract.contract_id} />
            </dd>

            {contract.title && (
              <>
                <dt className="text-text-dim uppercase">{t('contracts.detailDescription')}</dt>
                <dd className="min-w-0 space-y-1.5">
                  <p className="break-words">{contract.title}</p>
                  <ContractDescriptionLinks description={contract.title} />
                </dd>
              </>
            )}

            {contract.start_location_id && (
              <>
                <dt className="text-text-dim uppercase">{t('contracts.detailLocation')}</dt>
                <dd>
                  {location === undefined ? (
                    <Spinner size="sm" label={t('common.loading')} />
                  ) : (
                    <PlaceName id={contract.start_location_id} name={location.start} />
                  )}
                </dd>
              </>
            )}

            {systems?.start && <SystemRow system={systems.start} />}

            {contract.end_location_id && (
              <>
                <dt className="text-text-dim uppercase">{t('contracts.detailDestination')}</dt>
                <dd>
                  {location === undefined ? (
                    <Spinner size="sm" label={t('common.loading')} />
                  ) : (
                    <PlaceName id={contract.end_location_id} name={location.end} />
                  )}
                </dd>
              </>
            )}

            {systems?.end && <SystemRow system={systems.end} />}

            <dt className="text-text-dim uppercase">{t('contracts.detailDateIssued')}</dt>
            <dd>{formatTimestamp(new Date(contract.date_issued), timeZone)}</dd>

            <dt className="text-text-dim uppercase">{t('contracts.detailDateExpired')}</dt>
            <dd>{formatTimestamp(new Date(contract.date_expired), timeZone)}</dd>

            {deliverByMs !== null && (
              <>
                <dt className="text-text-dim uppercase">{t('contracts.detailDeliverBy')}</dt>
                <dd>{formatTimestamp(new Date(deliverByMs), timeZone)}</dd>
              </>
            )}

            {contract.date_accepted && (
              <>
                <dt className="text-text-dim uppercase">{t('contracts.detailDateAccepted')}</dt>
                <dd>{formatTimestamp(new Date(contract.date_accepted), timeZone)}</dd>
              </>
            )}

            {contract.date_completed && (
              <>
                <dt className="text-text-dim uppercase">{t('contracts.detailDateCompleted')}</dt>
                <dd>{formatTimestamp(new Date(contract.date_completed), timeZone)}</dd>
              </>
            )}

            {contract.days_to_complete !== undefined && (
              <>
                <dt className="text-text-dim uppercase">{t('contracts.detailDaysToComplete')}</dt>
                <dd>{contract.days_to_complete}</dd>
              </>
            )}

            {contract.volume !== undefined && (
              <>
                <dt className="text-text-dim uppercase">{t('contracts.detailVolume')}</dt>
                <dd>{contract.volume.toLocaleString()} m³</dd>
              </>
            )}
          </dl>
        </div>

        {(contract.price !== undefined ||
          contract.reward !== undefined ||
          contract.collateral !== undefined ||
          contract.buyout !== undefined) && (
          <dl className="divide-y divide-line border-y border-line">
            {contract.price !== undefined && (
              <IskRow label={t('contracts.detailPrice')} value={contract.price} />
            )}
            {contract.reward !== undefined && (
              <IskRow label={t('contracts.detailReward')} value={contract.reward} />
            )}
            {contract.collateral !== undefined && (
              <IskRow label={t('contracts.detailCollateral')} value={contract.collateral} />
            )}
            {contract.buyout !== undefined && (
              <IskRow label={t('contracts.detailBuyout')} value={contract.buyout} />
            )}
          </dl>
        )}

        {HAS_ITEMS.has(contract.type) && (
          <DataGate
            status={itemsFailed ? 'failed' : items === undefined ? 'busy' : 'ok'}
            title={t('common.couldntLoad')}
            hint={t('contracts.detailItemsFailedHint')}
            onRetry={() => setItemsAttempt((n) => n + 1)}
            resetKey={contract.contract_id}
            busy={
              <div className="flex justify-center py-4">
                <Spinner size="sm" label={t('common.loading')} />
              </div>
            }
          >
            {items !== undefined &&
              (items.list.length === 0 ? (
                <EmptyState title={t('contracts.detailNoItems')} className="py-4" />
              ) : (
                <>
                  {itemColumns && (
                    <ItemSection
                      contractId={contract.contract_id}
                      title={t('contracts.detailItemsIncluded')}
                      columns={itemColumns}
                      items={included}
                      typeNames={items.typeNames}
                      marketValue={
                        contract.status === 'outstanding' ? marketValue?.included : undefined
                      }
                      hubName={hub.systemName}
                    />
                  )}
                  {itemColumns && (
                    <ItemSection
                      contractId={contract.contract_id}
                      title={t('contracts.detailItemsRequested')}
                      columns={itemColumns}
                      items={requested}
                      typeNames={items.typeNames}
                      marketValue={
                        contract.status === 'outstanding' ? marketValue?.requested : undefined
                      }
                      hubName={hub.systemName}
                    />
                  )}
                </>
              ))}
          </DataGate>
        )}
      </div>
    </SlideOver>
  );
}

/**
 * One "Included"/"Requested" list. Both are the same table over the same
 * columns, differing only in title and rows, so they share a component
 * rather than the block being written out twice — the right-click menu and
 * the narrow-screen wrapper had to stay in step across both.
 *
 * `marketValue` is `undefined` while still loading (or not applicable to this
 * contract's status) and `null` when there is nothing to price — either way,
 * no row renders. Only a resolved `ContractMarketValue` renders one.
 */
function ItemSection({
  contractId,
  title,
  columns,
  items,
  typeNames,
  marketValue,
  hubName,
}: {
  contractId: number;
  title: string;
  columns: DataTableColumn<ContractItem>[];
  items: ContractItem[];
  typeNames: ReadonlyMap<number, string>;
  marketValue: ContractMarketValue | null | undefined;
  hubName: string;
}) {
  const { t } = useTranslation();
  const csvColumns = useMemo(() => contractItemsCsvColumns(t, typeNames), [t, typeNames]);
  // Contract id and section in the filename: exporting Included then
  // Requested, or two contracts in a row, never overwrites the same file.
  const tableExport = useTableExport({
    surface: 'contract-items',
    rows: items,
    columns: csvColumns,
    qualifier: `${contractId} ${title}`,
  });
  if (items.length === 0) return null;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-line pb-1">
        <h3 className={cx(eyebrowClassName, 'flex items-center gap-1.5')}>{title}</h3>
        <TableActionsMenu name={title} tableExport={tableExport} />
      </div>
      <div className="overflow-x-auto">
        <DataTable
          {...tableExport.tableProps}
          label={title}
          columns={columns}
          rows={items}
          rowKey={(item) => item.record_id}
          density="compact"
          responsive="table"
          rowMoreActions
          rowContextMenu={(item, tr) => (
            <BuildPlanContextMenu
              typeId={item.type_id}
              itemName={typeNames.get(item.type_id)}
              trigger={tr}
            />
          )}
        />
      </div>
      {marketValue && <ContractMarketValueRow value={marketValue} hubName={hubName} />}
    </div>
  );
}

/** A resolved station/structure name opens its Place Info; an unresolved id stays plain `#id`. */
function PlaceName({ id, name }: { id: number; name: string | null }) {
  return name === null ? <>{`#${id}`}</> : <PlaceLink id={id}>{name}</PlaceLink>;
}

/**
 * The system under a Location/Destination row, linked to Route Safety the way
 * `PublicContractDetailModal`'s System row is.
 */
function SystemRow({ system }: { system: SystemRef }) {
  const { t } = useTranslation();
  return (
    <>
      <dt className="text-text-dim uppercase">{t('contractDetail.systemLabel')}</dt>
      <dd>
        <SystemLink systemId={system.id}>{system.name}</SystemLink>
      </dd>
    </>
  );
}

/**
 * Neutral color, not `isk-pos`/`isk-neg` — those tokens signal gain/loss
 * *to this character*, but a `Contract` alone doesn't say whether the active
 * character is the issuer or the acceptor, so "Acceptor Pays" could be this
 * character's outflow or the other side's. Coloring it as a gain either way
 * would be a wrong signal, not just a missing one.
 */
function IskRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-text-dim">{label}</span>
      <span className="tabular-nums font-semibold">
        {formatIskAuto(value, CONTRACT_ISK_CENTS_BELOW)}
      </span>
    </div>
  );
}
