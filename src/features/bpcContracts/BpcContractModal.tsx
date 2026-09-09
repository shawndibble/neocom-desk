/**
 * Full detail for one public BPC contract, opened from a row in BPC Search.
 *
 * The row a buyer clicked is only the blueprint line; contracts routinely
 * bundle several items, and "what else is in this?" is the question the table
 * cannot answer. Item lines come from the public ESI route, which needs no
 * scope — the character-scoped one the Contracts page uses cannot serve these
 * at all, since no character here is party to them.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Modal, Spinner, StatChip } from '@/components/ui';
import { formatIsk } from '@/lib/isk';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { loadStationName } from '@/features/character/stations';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadPublicContractItems } from '@/features/bpcContracts/publicContractItems';
import { BuildPlanContextMenu } from '@/features/industry/BuildPlanContextMenu';
import { seedFromContractItem } from '@/features/industry/planSeed';
import type { PublicContractItem } from '@/esi/endpoints';
import type { BpcContractRow } from '@/engine/contracts/bpcSearch';

export interface BpcContractModalProps {
  row: BpcContractRow;
  blueprintName: string;
  regionName: string;
  onClose: () => void;
}

interface ItemsState {
  list: PublicContractItem[];
  typeNames: Map<number, string>;
}

export function BpcContractModal({
  row,
  blueprintName,
  regionName,
  onClose,
}: BpcContractModalProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const [station, setStation] = useState<string | null | undefined>(undefined);
  const [items, setItems] = useState<ItemsState | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setStation(undefined);
      const name = await loadStationName(row.locationId);
      if (!cancelled) setStation(name);
    })();
    return () => {
      cancelled = true;
    };
  }, [row.locationId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setItems(undefined);
      const result = await loadPublicContractItems(row.contractId);
      if (cancelled) return;
      if (!result?.data) {
        setItems(null);
        return;
      }
      // Names for every line, not just the blueprint — the bundle is the point.
      const typeNames = await loadTypeNames(result.data.map((item) => item.type_id));
      if (!cancelled) setItems({ list: result.data, typeNames });
    })();
    return () => {
      cancelled = true;
    };
  }, [row.contractId]);

  const priceLabel = row.isAuction
    ? row.buyout !== undefined
      ? t('bpcContracts.buyout', { price: formatIsk(row.buyout, 2) })
      : t('bpcContracts.startingBid', { price: formatIsk(row.price, 2) })
    : formatIsk(row.price, 2);

  return (
    <Modal open onClose={onClose} title={blueprintName}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatChip label={t('bpcContracts.priceLabel')} value={priceLabel} />
          <StatChip label={t('bpcContracts.meTeLabel')} value={`${row.me} / ${row.te}`} />
          <StatChip label={t('bpcContracts.runsLabel')} value={String(row.runs)} />
          <StatChip label={t('bpcContracts.qtyLabel')} value={String(row.quantity)} />
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-text-dim">{t('bpcContracts.regionColumn')}</dt>
          <dd className="truncate">{regionName}</dd>
          <dt className="text-text-dim">{t('bpcContracts.stationLabel')}</dt>
          <dd className="truncate">
            {station === undefined ? (
              <Spinner />
            ) : (
              (station ?? t('bpcContracts.unknownStation', { id: row.locationId }))
            )}
          </dd>
          <dt className="text-text-dim">{t('bpcContracts.expiresColumn')}</dt>
          <dd className="tabular-nums">{formatTimestamp(new Date(row.dateExpired), timeZone)}</dd>
          <dt className="text-text-dim">{t('bpcContracts.contractIdLabel')}</dt>
          <dd className="tabular-nums">{row.contractId}</dd>
        </dl>

        <div>
          <p className="flex items-center gap-1.5 pb-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('bpcContracts.contentsHeading')}
          </p>
          {items === undefined ? (
            <Spinner />
          ) : items === null ? (
            <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
          ) : (
            <ul className="flex flex-col gap-1">
              {items.list.map((item) => (
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
                            {t('bpcContracts.requestedItem')}
                          </span>
                        )}
                      </span>
                      {item.is_blueprint_copy && (
                        <span className="shrink-0 text-[0.6875rem] tabular-nums text-text-dim">
                          {t('bpcContracts.itemMeTe', {
                            me: item.material_efficiency ?? 0,
                            te: item.time_efficiency ?? 0,
                          })}
                          {item.runs !== undefined &&
                            ` · ${t('bpcContracts.runsShort', { runs: item.runs })}`}
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
