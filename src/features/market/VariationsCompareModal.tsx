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
 *
 * One `DataTable` per attribute category (issue #1128), so the matrix
 * inherits the default below-`sm` stack — a card per attribute, one labelled
 * line per item — rather than showing two of up to `VARIATIONS_LIMIT` (20)
 * 96px columns at a time. Same trade DESIGN.md §4a records for
 * `SkillCompare` in #406. §4a's one-DOM rule forbids a `sm:hidden` pair, so
 * the header loses its 32px `TypeIcon`: `DataTableColumn.header` is a string,
 * and the stacked label is CSS `content: attr(data-label)`.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, EmptyState, IskAmount, Modal, Spinner } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import {
  buildCompareMatrix,
  type CompareAttributeGroup,
  type CompareAttributeRow,
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

/** A price is shorthand — the whole table is a side-by-side scan — with the exact figure one gesture away; an attribute keeps its own unit and precision. */
function formatCell(kind: 'price' | 'attribute', cell: CompareCell): ReactNode {
  if (kind === 'price') return <IskAmount value={cell.value} revealOn="tap" />;
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

  const columns = useMemo<DataTableColumn<CompareAttributeRow>[]>(
    () => [
      {
        id: 'attribute',
        header: t('market.variationsCompare.attributeColumn'),
        primary: true,
        // The `sm:` half is the desktop matrix, and `sm` is where `.dt-stack`
        // stops (`width < 40rem`): pinned, so the attribute still says which
        // row you are on 19 columns to the right, and dim, as a row label
        // beside its values. Once it titles a card instead, dim would make
        // the one line naming the card the quietest thing on it.
        className: 'whitespace-nowrap sm:sticky sm:left-0 sm:z-10 sm:bg-panel sm:text-text-dim',
        // A floor, so the pinned gutter is the same width in every category —
        // each table sizes its own columns off its own longest name.
        headerClassName: 'sm:sticky sm:left-0 sm:z-10 sm:bg-panel sm:min-w-40',
        render: (row) => row.name,
      },
      ...items.map((item): DataTableColumn<CompareAttributeRow> => ({
        id: `item-${item.typeId}`,
        header: item.name,
        align: 'right',
        className: 'tabular-nums',
        // 20 items in a `max-w-5xl` modal compress to ~50px each without a
        // floor — narrower than the figures they hold.
        headerClassName: 'sm:min-w-24',
        render: (row) => {
          const cell = row.cells.get(item.typeId);
          return cell ? formatCell(row.kind, cell) : emptyCell(row.kind, item, prices);
        },
      })),
    ],
    [items, prices, t]
  );

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
        // One scroller for every category, not one each: the categories are
        // still a single matrix of the same items, so scrolling Fitting to
        // column 12 has to take Capacitor with it. Inert below `sm`, where
        // `.dt-stack` makes each table a column of full-width cards.
        <div className="space-y-3 overflow-x-auto">
          {groups.map((group) => (
            <section key={group.category}>
              {/* Pinned left: the heading sits above the full scrolling width,
                  so it would otherwise slide away with the columns. Ungated,
                  unlike the cells below — nothing scrolls sideways under
                  `sm`, so it is already inert there. */}
              <h3 className="sticky left-0 mb-1 inline-block bg-panel pr-3 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {group.category}
              </h3>
              <DataTable
                columns={columns}
                rows={group.rows}
                rowKey={(row) => row.key}
                label={group.category}
                density="compact"
                // Scroll rather than squeeze: the floors above only hold if
                // the table may outgrow the modal.
                className="sm:min-w-max"
              />
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}
