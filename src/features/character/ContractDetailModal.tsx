/**
 * Contract detail: everything the in-game contract window shows for one
 * contract, mounted only while selected (`EventDetailModal`'s pattern). The
 * summary fields (type, status, issuer, dates, ISK) are already on the
 * `Contract` the caller has in hand, so those render immediately; only the
 * location name(s) and item lines need an ESI round trip, so each gets its
 * own small loading state rather than blocking the whole panel.
 *
 * Laid out for the question a reader brings to a contract: what it is (status
 * pill, headline figure), what is in it (items first), whether the price was
 * fair (`useOwnContractPriceCheck`), who and where, and how it progressed
 * (timeline) — in place of a fourteen-row label/value list. Decision
 * 20261020-005242-contract-detail-price-check.
 *
 * Labeled from ESI's own fields, not the game's "Buyer Will Pay/Get" framing
 * — that flips depending on which side of the trade this character is on.
 * `price` is what the acceptor pays, `reward` is what the acceptor receives;
 * items split on `is_included` into what the issuer hands over ("Included")
 * vs what the acceptor must supply ("Requested").
 */
import { createNumberFormat } from '@/lib/numberLocale';
import { formatCount } from '@/lib/formatCount';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DataTable,
  EmptyState,
  Eyebrow,
  SlideOver,
  Spinner,
  StatChip,
  StatChips,
  TypeIcon,
  type DataTableColumn,
} from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { DataGate } from '@/components/DataGate';
import { loadContractItemsDetailed } from './contractItems';
import { archivedContractItems, pastEsiWindow } from './contractArchive';
import { contractItemsCsvColumns } from './contractItemsCsv';
import { loadContractLocationName } from './contractLocationName';
import { loadTypeNames } from './typeNames';
import { ContractAbyssalValue } from '@/features/contracts/ContractAbyssalValue';
import { ContractDescriptionLinks } from '@/features/contracts/ContractDescriptionLinks';
import { ContractPriceCheck } from '@/features/contracts/ContractPriceCheck';
import { ContractTimeline } from '@/features/contracts/ContractTimeline';
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
import { useOwnContractPriceCheck } from './useOwnContractPriceCheck';
import { formatContractIsk, formatIsk } from '@/lib/isk';
import { Link } from 'react-router-dom';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { priceDiffers } from '@/engine/communities/buybackContracts';
import { useBuybackLinks } from '@/features/communities/buybackLinks';
import { communityRequestPath } from '@/features/communities/communityStore';
import { formatDuration } from '@/lib/duration';
import { formatTimestamp } from '@/lib/timestamp';
import { useNow } from '@/lib/useNow';
import { contractStatusTone, isActiveContractStatus } from '@/engine/contracts/contractStatus';
import { contractTimeline } from '@/engine/contracts/contractTimeline';
import { courierDeliveryDeadlineMs } from '@/engine/contracts/courierDeadline';
import { useTimeZone } from '@/lib/timeFormat';
import type { Contract, ContractItem } from '@/esi/endpoints';

const formatDecimal = createNumberFormat({ maximumFractionDigits: 3 });

export interface ContractDetailModalProps {
  characterId: number;
  /** Set for a corporation's contract: its items are read through the corp route. */
  corporationId?: number;
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

const HAS_ITEMS = new Set<Contract['type']>(['item_exchange', 'auction']);

export function ContractDetailModal({
  characterId,
  corporationId,
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
  const buyback = useBuybackLinks(characterId).get(contract.contract_id);
  const timeZone = useTimeZone();
  const now = useNow();
  const deliverByMs = courierDeliveryDeadlineMs(contract);
  const hubId = useMarketHub((s) => s.value);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  const isAbyssalType = useMutaplasmidLookup()?.isAbyssalType;
  const [location, setLocation] = useState<LocationState | undefined>(undefined);
  /** `undefined` until resolved; the system link stays hidden meanwhile rather than spinning. */
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
  /** ESI no longer has this old contract's items and none were kept when it was opened. */
  const [itemsNotKept, setItemsNotKept] = useState(false);

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

  const pastEsi = pastEsiWindow(contract);
  useEffect(() => {
    if (!HAS_ITEMS.has(contract.type)) return;
    let cancelled = false;
    void (async () => {
      setItems(undefined);
      setItemsFailed(false);
      setItemsNotKept(false);
      const outcome = await loadContractItemsDetailed(
        characterId,
        contract.contract_id,
        corporationId
      );
      if (outcome.result === null) {
        // Kept when the pilot opened it while ESI still had it (own contracts only).
        const kept =
          corporationId === undefined
            ? await archivedContractItems(characterId, contract.contract_id)
            : null;
        if (cancelled) return;
        if (kept) {
          const typeNames = await loadTypeNames(kept.map((item) => item.type_id));
          if (!cancelled) setItems({ list: kept, typeNames });
          return;
        }
        if (outcome.failureStatus === 404 && pastEsi) setItemsNotKept(true);
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
  }, [characterId, corporationId, contract.type, contract.contract_id, pastEsi, itemsAttempt]);

  const priceCheck = useOwnContractPriceCheck({
    contract,
    items: HAS_ITEMS.has(contract.type) ? items?.list : undefined,
    hub,
    isAbyssalType,
  });

  const abyssalCount = items?.list.filter((item) => isAbyssalType?.(item.type_id)).length ?? 0;
  const isRoute =
    !!contract.end_location_id && contract.end_location_id !== contract.start_location_id;
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
      stickyStart: true,
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
      render: (item) => formatCount(item.quantity),
    },
  ];

  // The figures that matter, in the order a reader weighs them. A zero or
  // absent ISK field is dropped rather than printed as 0.00.
  const iskFigures = [
    { key: 'price', label: t('contracts.detailPrice'), value: contract.price },
    { key: 'reward', label: t('contracts.detailReward'), value: contract.reward },
    { key: 'collateral', label: t('contracts.detailCollateral'), value: contract.collateral },
    { key: 'buyout', label: t('contracts.detailBuyout'), value: contract.buyout },
  ].filter((figure): figure is typeof figure & { value: number } => (figure.value ?? 0) > 0);
  const itemForItem = items !== undefined && iskFigures.length === 0 && requested.length > 0;
  const finishedAt = contract.date_completed;
  // Where the contract's story ends: an expiry still ahead, a lapse, or an
  // outcome (cancelled, rejected…). The strip shows an expiry only for the first
  // two; a withdrawn contract has none worth reading.
  const timeline = contractTimeline(contract, now);
  const timelineEnd = timeline[timeline.length - 1]!.key;
  const hasItemLines = items !== undefined && items.list.length > 0;
  const volumeText =
    contract.volume !== undefined && contract.volume > 0
      ? `${formatDecimal(contract.volume)} m³`
      : null;
  // A contract that can still be taken counts down; one that has lapsed or is
  // over shows the date instead, since "Expires in 0m" would say nothing.
  const msLeft = new Date(contract.date_expired).getTime() - now;
  const countdown =
    isActiveContractStatus(contract.status) && msLeft > 0 ? formatDuration(msLeft / 1000) : null;

  return (
    <SlideOver
      open
      onClose={onClose}
      contentKey={contract.contract_id}
      maxWidthClassName="max-w-[28rem]"
      title={
        <span className="flex flex-wrap items-center gap-2">
          {title}
          <Pill tone={contractStatusTone(contract.status)}>
            {t(CONTRACT_STATUS_KEY[contract.status])}
          </Pill>
        </span>
      }
      subtitle={
        <span className="flex flex-wrap items-center gap-x-1">
          <span className="tabular-nums">{contract.contract_id}</span>
          <CopyContractIdButton contractId={contract.contract_id} />
          <OpenInEveButton
            kind="contract"
            id={contract.contract_id}
            name={t('contractDetail.openInEveName', { id: contract.contract_id })}
          />
        </span>
      }
    >
      <div className="space-y-5 text-xs">
        {buyback && (
          <p className="space-y-1">
            <Link
              to={communityRequestPath(buyback.communityId, buyback.requestId)}
              className={`${inlineLinkClassName} inline-flex min-h-9 items-center md:min-h-0`}
            >
              {t('contractDetail.buyback', {
                title: buyback.requestTitle,
                community: buyback.communityName,
              })}
            </Link>
            {contract.price !== undefined && priceDiffers(contract.price, buyback.quotedTotal) && (
              <span className="block text-warning">
                {t('contractDetail.buybackDiffers', { quoted: formatIsk(buyback.quotedTotal) })}
              </span>
            )}
          </p>
        )}
        <StatChips>
          {iskFigures.map((figure, index) => (
            <StatChip
              key={figure.key}
              emphasis={index === 0}
              label={figure.label}
              value={formatContractIsk(figure.value)}
            />
          ))}
          {itemForItem && (
            <StatChip
              emphasis
              label={t('contractDetail.headlineTermsLabel')}
              value={t('contractDetail.headlineItemForItem')}
            />
          )}
          {hasItemLines && (
            <StatChip
              label={t('contractDetail.headlineItemsLabel')}
              value={`${t('contractDetail.headlineItems', { count: items.list.length })}${volumeText ? ` · ${volumeText}` : ''}`}
            />
          )}
          {!hasItemLines && volumeText && (
            <StatChip label={t('contracts.detailVolume')} value={volumeText} />
          )}
          {contract.days_to_complete !== undefined && contract.days_to_complete > 0 && (
            <StatChip
              label={t('contracts.detailDaysToComplete')}
              value={String(contract.days_to_complete)}
            />
          )}
          {deliverByMs !== null && (
            <StatChip
              label={t('contracts.detailDeliverBy')}
              value={formatTimestamp(new Date(deliverByMs), timeZone)}
            />
          )}
          {finishedAt ? (
            <StatChip
              label={t('contractDetail.timelineCompleted')}
              value={formatTimestamp(new Date(finishedAt), timeZone)}
            />
          ) : timelineEnd === 'expires' ? (
            countdown !== null ? (
              <StatChip label={t('contractDetail.headlineExpiresIn')} value={countdown} />
            ) : (
              <StatChip
                label={t('contractDetail.timelineExpires')}
                value={formatTimestamp(new Date(contract.date_expired), timeZone)}
              />
            )
          ) : timelineEnd === 'expired' ? (
            <StatChip
              label={t('contractDetail.timelineExpired')}
              value={formatTimestamp(new Date(contract.date_expired), timeZone)}
            />
          ) : null}
        </StatChips>

        {contract.title && (
          <div className="min-w-0 space-y-1.5">
            <Eyebrow>{t('contracts.detailDescription')}</Eyebrow>
            <p className="break-words">{contract.title}</p>
            <ContractDescriptionLinks description={contract.title} />
          </div>
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
                <EmptyState
                  title={
                    itemsNotKept ? t('contracts.detailItemsNotKept') : t('contracts.detailNoItems')
                  }
                  className="py-4"
                />
              ) : (
                <>
                  {itemColumns && (
                    <ItemSection
                      contractId={contract.contract_id}
                      title={t('contracts.detailItemsIncluded')}
                      columns={itemColumns}
                      items={included}
                      typeNames={items.typeNames}
                    />
                  )}
                  {itemColumns && (
                    <ItemSection
                      contractId={contract.contract_id}
                      title={t('contracts.detailItemsRequested')}
                      columns={itemColumns}
                      items={requested}
                      typeNames={items.typeNames}
                    />
                  )}
                </>
              ))}
          </DataGate>
        )}

        {priceCheck && <ContractPriceCheck {...priceCheck} />}
        {abyssalCount > 0 && (
          // Own-contract lines carry no item id, so a module cannot be identified
          // to MutaMarket: it reads as not priced, and why.
          <ContractAbyssalValue value={{ estimated: 0, priced: 0, unpriced: abyssalCount }} />
        )}

        <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">
          <div>
            <Eyebrow>{t('contracts.detailIssuedBy')}</Eyebrow>
            <p className="flex flex-wrap items-center gap-1.5">
              {issuer.kind === 'corporation' ? (
                <CorporationLink id={issuer.id}>{issuerName}</CorporationLink>
              ) : (
                <CharacterLink id={issuer.id}>{issuerName}</CharacterLink>
              )}
              <StandingTag standing={issuerStanding} />
            </p>
          </div>
          {receiver && (
            <div>
              <Eyebrow>{t('contracts.detailReceivedBy')}</Eyebrow>
              <p>
                <ContractReceiverLink
                  receiver={receiver}
                  name={receiverName}
                  standing={receiverStanding}
                />
              </p>
            </div>
          )}
          {contract.start_location_id && (
            <PlaceBlock
              label={t('contracts.detailLocation')}
              from={{
                id: contract.start_location_id,
                name: location?.start,
                system: systems?.start ?? null,
              }}
              to={
                isRoute && contract.end_location_id
                  ? {
                      id: contract.end_location_id,
                      name: location?.end,
                      system: systems?.end ?? null,
                    }
                  : null
              }
            />
          )}
        </div>

        <ContractTimeline steps={timeline} />

        <p className="border-t border-line pt-3 text-text-dim">
          {title} · {t(CONTRACT_AVAILABILITY_KEY[contract.availability])}
        </p>
      </div>
    </SlideOver>
  );
}

/**
 * One "Included"/"Requested" list. Both are the same table over the same
 * columns, differing only in title and rows, so they share a component
 * rather than the block being written out twice — the right-click menu and
 * the narrow-screen wrapper had to stay in step across both.
 */
function ItemSection({
  contractId,
  title,
  columns,
  items,
  typeNames,
}: {
  contractId: number;
  title: string;
  columns: DataTableColumn<ContractItem>[];
  items: ContractItem[];
  typeNames: ReadonlyMap<number, string>;
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
    </div>
  );
}

interface PlaceEnd {
  id: number;
  /** `undefined` while the lookup is in flight; `null` when it did not resolve. */
  name: string | null | undefined;
  system: SystemRef | null;
}

/**
 * Splits a place name that leads with its system: an NPC station reads
 * "Jita IV - Moon 4", a structure "Badivefi - Tycho Brahe 18 HQ".
 */
function leadingSystem(name: string, system: string): { separator: string; rest: string } | null {
  if (!name.startsWith(system)) return null;
  const match = /^( - | )(.+)$/.exec(name.slice(system.length));
  return match ? { separator: match[1], rest: match[2] } : null;
}

/**
 * One place: the station name opens its Place Info, an unresolved id stays
 * plain `#id`. EVE station and structure names lead with their system
 * ("Badivefi - Tycho Brahe 18 HQ"), so when they do, that prefix is the Route
 * Safety link rather than a second line repeating the system. A name that does
 * not lead with it gets the system as a trailing link.
 */
function PlaceName({ id, name, system }: PlaceEnd) {
  const { t } = useTranslation();
  if (name === undefined) return <Spinner size="sm" label={t('common.loading')} />;
  if (name === null) return <>{`#${id}`}</>;
  const lead = system ? leadingSystem(name, system.name) : null;
  if (system && lead) {
    return (
      <>
        <SystemLink systemId={system.id}>{system.name}</SystemLink>
        {lead.separator}
        <PlaceLink id={id}>{lead.rest}</PlaceLink>
      </>
    );
  }
  return (
    <>
      <PlaceLink id={id}>{name}</PlaceLink>
      {system && !name.includes(system.name) && (
        <>
          {' · '}
          <SystemLink systemId={system.id}>{system.name}</SystemLink>
        </>
      )}
    </>
  );
}

/**
 * A contract's place, or its route (`from → to`) when the two ends differ.
 * Item exchanges and auctions report the same location at both ends, so only
 * a courier ever shows the arrow, and the row needs no Destination label.
 */
function PlaceBlock({ label, from, to }: { label: string; from: PlaceEnd; to: PlaceEnd | null }) {
  const { t } = useTranslation();
  return (
    <div className="col-span-full">
      <Eyebrow>{label}</Eyebrow>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span>
          <PlaceName {...from} />
        </span>
        {to && (
          <>
            <span aria-label={t('contracts.detailRouteTo')} className="text-text-dim">
              →
            </span>
            <span>
              <PlaceName {...to} />
            </span>
          </>
        )}
      </p>
    </div>
  );
}
