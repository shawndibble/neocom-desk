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
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Modal, Spinner, StatChip } from '@/components/ui';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { loadContractLocationName } from '@/features/character/contractLocationName';
import { loadTypeNames } from '@/features/character/typeNames';
import {
  loadPublicContractItems,
  type PublicContractItemsOutcome,
} from '@/features/bpcContracts/publicContractItems';
import { BuildPlanContextMenu } from '@/features/industry/BuildPlanContextMenu';
import { seedFromContractItem } from '@/features/industry/planSeed';

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
  const [location, setLocation] = useState<string | null | undefined>(undefined);
  const [items, setItems] = useState<ItemsState | null | undefined>(undefined);

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
          <dd className="tabular-nums">{contractId}</dd>
        </dl>

        <div>
          <p className="flex items-center gap-1.5 pb-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('contractDetail.contentsHeading')}
          </p>
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
          ) : (
            <ul className="flex flex-col gap-1">
              {items.outcome.items.map((item) => (
                <BuildPlanContextMenu
                  key={item.record_id}
                  typeId={item.type_id}
                  // This line's own ME/TE/runs, when ESI reported all three.
                  seed={seedFromContractItem(item)}
                  trigger={
                    <li
                      // Focusable so the menu is reachable by keyboard
                      // (Shift+F10 / the Menu key), the same treatment
                      // `DataTable` gives a row it wraps in one.
                      tabIndex={0}
                      className="flex items-baseline gap-2 rounded-xs border border-line bg-panel-2 px-2.5 py-1.5 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {items.typeNames.get(item.type_id) ?? `#${item.type_id}`}
                        {/* A line the issuer *wants* rather than offers: an
                        item_exchange contract can ask for one item and give
                        another, and a buyer reading a bundle needs the two
                        told apart. */}
                        {!item.is_included && (
                          <span className="pl-2 text-[0.6875rem] text-warning uppercase">
                            {t('contractDetail.requestedItem')}
                          </span>
                        )}
                      </span>
                      {item.is_blueprint_copy && (
                        <span className="shrink-0 text-[0.6875rem] tabular-nums text-text-dim">
                          {t('contractDetail.itemMeTe', {
                            me: item.material_efficiency ?? 0,
                            te: item.time_efficiency ?? 0,
                          })}
                          {item.runs !== undefined &&
                            ` · ${t('contractDetail.runsShort', { runs: item.runs })}`}
                        </span>
                      )}
                      <span className="shrink-0 tabular-nums">×{item.quantity}</span>
                    </li>
                  }
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
