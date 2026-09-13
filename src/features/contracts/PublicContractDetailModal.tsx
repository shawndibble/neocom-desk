/**
 * Full detail for one public contract, opened from a row in BPC Search or the
 * Contracts page's Search tab. Generalized out of `BpcContractModal` (issue
 * #928): the row a shopper clicked is only one line — a blueprint, a stack of
 * Tritanium — and a contract routinely bundles several, so "what else is on
 * this?" is a question no results table can answer on its own.
 *
 * Item lines come from the public ESI route, which needs no scope — the
 * character-scoped one the Contracts page's own History tab uses cannot serve
 * these at all, since no character here is party to them.
 *
 * Where the contract *is*, though, does need a character: a public contract is
 * as likely to sit in a player structure as an NPC station, and
 * `/universe/structures/{id}` is ACL-checked per character. So the location
 * goes through `loadContractLocationName` — the same station-or-structure
 * resolution the personal Contracts view uses — under the active Character.
 *
 * Callers supply the header (title + stat chips) since what is worth showing
 * there differs by row shape (a blueprint's ME/TE/runs, a plain item's
 * quantity) — everything below that (location, expiry, contract id, contents)
 * is the same for any public contract.
 *
 * The contents list answers one question — is this bundle worth the asking
 * price — so it carries what that needs and nothing else: an icon per line so
 * a pile is scannable rather than read word by word, ESI's per-stack records
 * merged into one line per item (`mergeContractItemLines`), the two sides of
 * an item_exchange split under their own headings instead of tagged inline,
 * and a sell-order total per side at the reader's Trade Hub. Every line
 * right-clicks into the same item actions the rest of the app offers.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, IconButton, Modal, Spinner, StatChip, TypeIcon } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { writeToClipboard } from '@/lib/clipboard';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { loadContractLocationName } from '@/features/character/contractLocationName';
import { loadTypeNames } from '@/features/character/typeNames';
import {
  loadContractMarketValue,
  type ContractMarketValue,
} from '@/features/character/contractMarketValue';
import {
  loadPublicContractItems,
  type PublicContractItemsOutcome,
} from '@/features/bpcContracts/publicContractItems';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { useMarketHub } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { BuildPlanContextMenu } from '@/features/industry/BuildPlanContextMenu';
import { ContractMarketValueRow } from './ContractMarketValueRow';
import {
  mergeContractItemLines,
  planSeedForLine,
  type ContractItemLine,
} from './contractItemLines';

export interface PublicContractDetailModalStatChip {
  label: string;
  value: string;
}

export interface PublicContractDetailModalProps {
  title: string;
  /**
   * Whose token resolves a player-structure location. Neither BPC Search nor
   * Contracts Search is per-Character itself — both read a shared snapshot —
   * but the structure endpoint behind the location is, and its ACL is per
   * Character.
   */
  characterId: number;
  contractId: number;
  locationId: number;
  regionName: string;
  /** Epoch ms. */
  dateExpired: number;
  /** Header figures the caller already knows how to word — price, ME/TE, a haul's reward. */
  statChips: readonly PublicContractDetailModalStatChip[];
  onClose: () => void;
}

interface ItemsState {
  outcome: PublicContractItemsOutcome;
  typeNames: Map<number, string>;
}

/** Sell-order totals per side, or null for a side with nothing on it. */
interface MarketValueState {
  included: ContractMarketValue | null;
  requested: ContractMarketValue | null;
}

export function PublicContractDetailModal({
  title,
  characterId,
  contractId,
  locationId,
  regionName,
  dateExpired,
  statChips,
  onClose,
}: PublicContractDetailModalProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const hubId = useMarketHub((s) => s.value);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  const [location, setLocation] = useState<string | null | undefined>(undefined);
  const [items, setItems] = useState<ItemsState | null | undefined>(undefined);
  const [marketValue, setMarketValue] = useState<MarketValueState | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLocation(undefined);
      const name = await loadContractLocationName(characterId, locationId);
      if (!cancelled) setLocation(name);
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, locationId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setItems(undefined);
      const result = await loadPublicContractItems(contractId);
      if (cancelled) return;
      if (!result?.data) {
        setItems(null);
        return;
      }
      const outcome = result.data;
      // Names for every line, not just the one the row was found through —
      // the bundle is the point.
      const typeNames =
        outcome.kind === 'items'
          ? await loadTypeNames(outcome.items.map((item) => item.type_id))
          : new Map<number, string>();
      if (!cancelled) setItems({ outcome, typeNames });
    })();
    return () => {
      cancelled = true;
    };
  }, [contractId]);

  // Merged before anything reads the lines, so the ISK total and the rendered
  // list are counting the same things.
  const lines =
    items && items.outcome.kind === 'items' ? mergeContractItemLines(items.outcome.items) : [];
  const included = lines.filter((line) => line.isIncluded);
  const requested = lines.filter((line) => !line.isIncluded);

  /**
   * Priced unconditionally, unlike the character modal's equivalent, which
   * skips a finished contract: every contract in the public snapshot is one
   * still standing, so there is no history case to exclude here.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!items || items.outcome.kind !== 'items' || items.outcome.items.length === 0) {
        setMarketValue(undefined);
        return;
      }
      const merged = mergeContractItemLines(items.outcome.items);
      const priced = (group: ContractItemLine[]) =>
        group.map((line) => ({ type_id: line.typeId, quantity: line.quantity }));
      const includedLines = merged.filter((line) => line.isIncluded);
      const requestedLines = merged.filter((line) => !line.isIncluded);
      const [includedValue, requestedValue] = await Promise.all([
        includedLines.length > 0
          ? loadContractMarketValue(hub, priced(includedLines), items.typeNames)
          : Promise.resolve(null),
        requestedLines.length > 0
          ? loadContractMarketValue(hub, priced(requestedLines), items.typeNames)
          : Promise.resolve(null),
      ]);
      if (!cancelled) setMarketValue({ included: includedValue, requested: requestedValue });
    })();
    return () => {
      cancelled = true;
    };
  }, [items, hub]);

  /**
   * Only an item_exchange contract asking for something in return has two
   * sides to tell apart. On a one-sided contract the split would be a heading
   * over the whole list and an empty second section, so a single section
   * carries the whole list — headed for the side it actually holds, since a
   * list of things the reader must *supply* must never read as a list of
   * things they get.
   */
  const twoSided = included.length > 0 && requested.length > 0;
  const oneSidedHeading =
    requested.length > 0 && included.length === 0
      ? t('contractDetail.youHandOverHeading')
      : t('contractDetail.contentsHeading');

  return (
    <Modal open onClose={onClose} title={title}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {statChips.map((chip) => (
            <StatChip key={chip.label} label={chip.label} value={chip.value} />
          ))}
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-text-dim">{t('contractDetail.regionLabel')}</dt>
          <dd className="truncate">{regionName}</dd>
          <dt className="text-text-dim">{t('contractDetail.locationLabel')}</dt>
          <dd className="truncate">
            {location === undefined ? (
              <Spinner />
            ) : (
              (location ?? t('contractDetail.unknownLocation', { id: locationId }))
            )}
          </dd>
          <dt className="text-text-dim">{t('contractDetail.expiresLabel')}</dt>
          <dd className="tabular-nums">{formatTimestamp(new Date(dateExpired), timeZone)}</dd>
          <dt className="text-text-dim">{t('contractDetail.contractIdLabel')}</dt>
          <dd className="flex items-center gap-1 tabular-nums">
            {contractId}
            <CopyContractIdButton contractId={contractId} />
          </dd>
        </dl>

        {items === undefined ? (
          <Spinner />
        ) : items === null ? (
          <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
        ) : items.outcome.kind === 'not-found' ? (
          // ESI no longer recognizes this contract_id as public — it has
          // expired, been fulfilled, or was withdrawn since the snapshot
          // that surfaced this row. An ordinary outcome for a row clicked
          // some time after it synced, not a fetch failure.
          <EmptyState
            title={t('contractDetail.noLongerListedTitle')}
            hint={t('contractDetail.noLongerListedHint')}
          />
        ) : lines.length === 0 ? (
          <EmptyState title={t('contracts.detailNoItems')} className="py-4" />
        ) : twoSided ? (
          <>
            <ItemGroup
              heading={t('contractDetail.youReceiveHeading')}
              lines={included}
              typeNames={items.typeNames}
              marketValue={marketValue?.included}
              hubName={hub.systemName}
            />
            <ItemGroup
              heading={t('contractDetail.youHandOverHeading')}
              lines={requested}
              typeNames={items.typeNames}
              marketValue={marketValue?.requested}
              hubName={hub.systemName}
            />
          </>
        ) : (
          <ItemGroup
            heading={oneSidedHeading}
            lines={lines}
            typeNames={items.typeNames}
            marketValue={included.length > 0 ? marketValue?.included : marketValue?.requested}
            hubName={hub.systemName}
          />
        )}
      </div>
    </Modal>
  );
}

/**
 * One headed list of lines, with its own sell-order total. `marketValue` is
 * `undefined` while prices are still loading and `null` when nothing on this
 * side could be priced; neither renders a total.
 */
function ItemGroup({
  heading,
  lines,
  typeNames,
  marketValue,
  hubName,
}: {
  heading: string;
  lines: ContractItemLine[];
  typeNames: ReadonlyMap<number, string>;
  marketValue: ContractMarketValue | null | undefined;
  hubName: string;
}) {
  return (
    <div>
      <h3 className="flex items-center gap-1.5 pb-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {heading}
      </h3>
      <ul className="flex flex-col gap-1">
        {lines.map((line) => (
          <ContractItemRow
            key={line.key}
            line={line}
            name={typeNames.get(line.typeId) ?? `#${line.typeId}`}
          />
        ))}
      </ul>
      {marketValue && (
        <div className="pt-1 text-sm">
          <ContractMarketValueRow value={marketValue} hubName={hubName} />
        </div>
      )}
    </div>
  );
}

/**
 * One line. The name is a link to the Market Browser, which also gives the row
 * its keyboard focus: a right-click menu opened with Shift+F10 fires from
 * whatever is focused inside the row, so the link doubles as the menu's
 * keyboard handle and the row needs no `tabIndex` of its own competing with it
 * for a tab stop.
 */
function ContractItemRow({ line, name }: { line: ContractItemLine; name: string }) {
  const { t } = useTranslation();
  return (
    <BuildPlanContextMenu
      typeId={line.typeId}
      itemName={name}
      // This line's own ME/TE/runs, when ESI reported all three.
      seed={planSeedForLine(line)}
      trigger={
        <li className="flex items-center gap-2 rounded-xs border border-line bg-panel-2 px-2 py-1.5 text-sm hover:border-line-bright">
          <TypeIcon
            typeId={line.typeId}
            size={32}
            width={24}
            height={24}
            className="shrink-0 rounded-xs border border-line"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate">
              <MarketItemLink typeId={line.typeId}>{name}</MarketItemLink>
            </span>
            {line.isBlueprintCopy && (
              <span className="block text-[0.6875rem] tabular-nums text-text-dim">
                {t('contractDetail.itemMeTe', {
                  me: line.materialEfficiency ?? 0,
                  te: line.timeEfficiency ?? 0,
                })}
                {line.runs !== undefined &&
                  ` · ${t('contractDetail.runsShort', { runs: line.runs })}`}
              </span>
            )}
          </span>
          <span className="shrink-0 tabular-nums">×{line.quantity.toLocaleString()}</span>
        </li>
      }
    />
  );
}

/**
 * The contract ID exists to be pasted — into an in-game search, a chat channel,
 * a note — and selecting a number out of a definition list by hand is the one
 * thing a reader should not have to do with it. The results table already
 * offers the same action per row under the same wording.
 */
function CopyContractIdButton({ contractId }: { contractId: number }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <IconButton
      variant="plain"
      size="sm"
      label={t('contracts.contextMenu.copyContractId')}
      icon={
        copied ? (
          <Icon.Done size={Icon.ICON_SIZE.sm} />
        ) : (
          <Icon.CopyToClipboard size={Icon.ICON_SIZE.sm} />
        )
      }
      onClick={() => {
        void writeToClipboard(String(contractId));
        setCopied(true);
      }}
    />
  );
}
