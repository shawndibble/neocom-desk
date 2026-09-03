/**
 * Variations "Compare" modal (issue #146): every item currently shown in
 * the Variations table, side by side — items as columns, dogma attributes
 * as rows grouped by category (src/engine/market/attributeCompareMatrix.ts),
 * mirroring the EVE client's own Variations-tab Compare flow. Fetches each
 * item's full dogma attributes live and in parallel, same ESI call
 * `ItemDetailModal` uses per item, with one loading/error state for the
 * modal as a whole rather than per item. The price row is recomputed from
 * the `prices` prop on every render instead of baked into the fetched data,
 * so a variation price that finishes loading after the modal opens (the
 * Variations table fetches those independently) still lands in the matrix
 * without a refetch.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Modal, Spinner } from '@/components/ui';
import {
  buildCompareMatrix,
  type CompareAttributeGroup,
  type CompareCell,
} from '@/engine/market/attributeCompareMatrix';
import type {
  AttributeDictionary,
  AttributeReferenceNames,
  RawDogmaAttribute,
} from '@/engine/market/itemAttributes';
import type { OrderBookSummary } from '@/engine/market/orderBook';
import { getUniverseType } from '@/esi/endpoints';
import { loadAttributeDictionary } from '@/sde/loadMarketSde';
import { typeIconUrl } from '@/lib/eveImages';
import { formatIsk } from '@/lib/isk';
import { loadAttributeReferenceNames } from './attributeReferenceNames';
import { formatAttributeValue } from './format';

export interface VariationsCompareModalItem {
  typeId: number;
  name: string;
}

export interface VariationsCompareModalProps {
  items: readonly VariationsCompareModalItem[];
  prices: ReadonlyMap<number, OrderBookSummary | undefined>;
  onClose: () => void;
}

interface FetchedData {
  dogmaByTypeId: ReadonlyMap<number, readonly RawDogmaAttribute[] | undefined>;
  dictionary: AttributeDictionary;
  names: AttributeReferenceNames;
}

function formatCell(kind: 'price' | 'attribute', cell: CompareCell): string {
  if (kind === 'price') return formatIsk(cell.value, 2);
  return (
    cell.displayValue ??
    `${formatAttributeValue(cell.value, cell.unit)}${cell.unit ? ` ${cell.unit}` : ''}`
  );
}

/**
 * What an absent cell reads as. A price the Variations table has requested
 * but not yet resolved is still on its way, so it gets CompareDrawer's "…"
 * rather than the "—" that means "there is no value here"; an attribute the
 * item simply doesn't have is always the latter.
 */
function emptyCell(
  kind: 'price' | 'attribute',
  item: VariationsCompareModalItem,
  prices: ReadonlyMap<number, OrderBookSummary | undefined>
): string {
  const loadingPrice = kind === 'price' && prices.has(item.typeId) && !prices.get(item.typeId);
  return loadingPrice ? '…' : '—';
}

/** Mounted only while open (ItemDetailModal's pattern) — mounting is the open signal. */
export function VariationsCompareModal({ items, prices, onClose }: VariationsCompareModalProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<FetchedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // A fresh `items` array reference can land on every render; the fetch
  // effect keys on a value-stable typeId signature instead (useCompareRows.ts
  // pattern) so an unrelated re-render doesn't restart every ESI fetch.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });
  const itemsKey = items.map((item) => item.typeId).join(',');

  useEffect(() => {
    const currentItems = itemsRef.current;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setData(null);
      setError(false);
      try {
        const [types, dictionary] = await Promise.all([
          Promise.all(currentItems.map((item) => getUniverseType(item.typeId))),
          loadAttributeDictionary(),
        ]);
        if (cancelled) return;
        if (types.some((result) => !result.data)) throw new Error('Missing type data');
        const dogmaByTypeId = new Map(
          currentItems.map((item, index) => [item.typeId, types[index].data?.dogma_attributes])
        );
        // One resolve for the whole matrix: ids repeat hard across variations,
        // so every column shares the lookups the first one paid for.
        const names = await loadAttributeReferenceNames([...dogmaByTypeId.values()], dictionary);
        if (cancelled) return;
        setData({ dogmaByTypeId, dictionary, names });
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemsKey]);

  const groups = useMemo<CompareAttributeGroup[] | null>(() => {
    if (!data) return null;
    const matrixItems = items.map((item) => ({
      typeId: item.typeId,
      dogmaAttributes: data.dogmaByTypeId.get(item.typeId),
      bestSell: prices.get(item.typeId)?.bestSell,
    }));
    return buildCompareMatrix(
      matrixItems,
      data.dictionary,
      {
        worth: t('market.variationsCompare.worth'),
        estimatedPrice: t('market.variationsCompare.estimatedPrice'),
      },
      data.names
    );
  }, [data, items, prices, t]);

  return (
    <Modal open onClose={onClose} title={t('market.variationsCompare.title')} placement="wide">
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner label={t('common.loading')} />
        </div>
      ) : error || !groups ? (
        <EmptyState
          title={t('market.variationsCompare.errorTitle')}
          hint={t('market.variationsCompare.errorHint')}
          className="py-8"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-xs">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 bg-panel"></th>
                {items.map((item) => (
                  <th
                    key={item.typeId}
                    scope="col"
                    className="min-w-24 border-b border-line px-2 py-1 text-center font-medium text-text"
                  >
                    <img
                      src={typeIconUrl(item.typeId, 32)}
                      alt=""
                      width={32}
                      height={32}
                      className="mx-auto rounded-xs border border-line"
                    />
                    <div className="mt-1 truncate">{item.name}</div>
                  </th>
                ))}
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.category}>
                <tr>
                  <th
                    scope="rowgroup"
                    colSpan={items.length + 1}
                    className="border-b border-line pt-2 pb-1 text-left"
                  >
                    {/* The cell spans the full (scrolling) table width, so the
                        label is pinned by a sticky child rather than a sticky
                        cell — otherwise it scrolls away with the columns. */}
                    <div className="sticky left-0 inline-block bg-panel pr-3 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                      {group.category}
                    </div>
                  </th>
                </tr>
                {group.rows.map((row) => (
                  <tr key={row.key}>
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-panel py-0.5 pr-3 text-left font-normal whitespace-nowrap text-text-dim"
                    >
                      {row.name}
                    </th>
                    {items.map((item) => {
                      const cell = row.cells.get(item.typeId);
                      return (
                        <td key={item.typeId} className="py-0.5 text-right tabular-nums text-text">
                          {cell ? formatCell(row.kind, cell) : emptyCell(row.kind, item, prices)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </Modal>
  );
}
