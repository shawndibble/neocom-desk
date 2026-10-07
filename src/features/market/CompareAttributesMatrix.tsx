/**
 * The Compare drawer's Attributes view (issue #1425, folded in from the old
 * `VariationsCompareModal`, issue #146): items as columns, dogma attributes
 * as rows grouped by category (`src/engine/market/attributeCompareMatrix.ts`),
 * mirroring the EVE client's own Variations-tab Compare flow. Dogma is
 * fetched by `useCompareAttributes` in the caller; this component is pure
 * render once that data has arrived.
 *
 * One `DataTable` per attribute category, a real matrix at every width —
 * not the below-`sm` stacked card issue #1128 once chose, which put every
 * item name into the same truncated 6.5rem label gutter ("LARGE SHIELD
 * EXTEN…" five times over) and made one card per attribute. Instead the
 * words every item shares move into the header's corner
 * (`shortCompareLabels`), the columns narrow on a phone so five items fit
 * 390px, more than that scroll sideways under the pinned attribute column,
 * and "Differences only" (on by default) hides the attributes every item
 * agrees on — most of them, for variants of one item.
 *
 * The item names sit once, in one sticky header row above every category,
 * rather than atop each category's table: a matrix with a dozen categories
 * otherwise repeated every name a dozen times. Each category table keeps its
 * own header row for assistive tech (visually hidden), and every table takes
 * the same explicit column widths (the `--compare-*-width` variables below)
 * so the columns line up under the one header.
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, DataTable, Tooltip, TypeIcon } from '@/components/ui';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { Caret } from '@/components/ui/Disclosure';
import type { DataTableColumn } from '@/components/ui';
import { IskAmount } from '@/components/ui';
import type { UseTableExport } from '@/components/ui/useTableExport';
import {
  isUniformRow,
  type CompareAttributeRow,
  type CompareCell,
} from '@/engine/market/attributeCompareMatrix';
import { shortCompareLabels } from '@/engine/market/compareLabels';
import { MarketItemLink } from './MarketItemLink';
import type { CompareAttributesData } from './useCompareAttributes';
import type { CompareRow } from './useCompareRows';
import { formatAttributeValue } from './format';
import { useCompareAttributeGroups } from './useCompareAttributesExport';
import { RemovableTypeIcon } from './RemovableTypeIcon';
import { marketIskDecimals } from '@/lib/isk';

export interface CompareAttributesMatrixProps {
  /** The drawer's own price rows — one per Compare Set item, loading state and best-sell summary included. */
  rows: readonly CompareRow[];
  data: CompareAttributesData;
  /**
   * The drawer's export for this matrix (`useCompareAttributesExport`), so
   * every category's table offers the one whole-matrix export. It always
   * exports every attribute, whatever "Differences only" hides.
   */
  tableExport?: UseTableExport<CompareAttributeRow>;
  /** Drops an item from the Compare Set — the "×" on each header icon. */
  onRemove?: (typeId: number) => void;
}

/** A price is shorthand — the whole table is a side-by-side scan — with the exact figure one gesture away; an attribute keeps its own unit and precision. */
function formatCell(kind: 'price' | 'attribute', cell: CompareCell): ReactNode {
  if (kind === 'price')
    return <IskAmount value={cell.value} decimals={marketIskDecimals(cell.value)} />;
  return (
    cell.displayValue ??
    `${formatAttributeValue(cell.value, cell.unit)}${cell.unit ? ` ${cell.unit}` : ''}`
  );
}

/**
 * What an absent cell reads as. A price this row's own `useCompareRows` fetch
 * hasn't resolved yet gets "…" — it's still on its way — while an attribute
 * the item simply doesn't have, or a price fetch that resolved to nothing, is
 * always "—".
 */
function emptyCell(kind: 'price' | 'attribute', row: CompareRow): string {
  return kind === 'price' && row.loading ? '…' : '—';
}

export function CompareAttributesMatrix({
  rows,
  data,
  tableExport,
  onRemove,
}: CompareAttributesMatrixProps) {
  const { t } = useTranslation();
  const [differencesOnly, setDifferencesOnly] = useState(true);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  const rowsByTypeId = useMemo(() => new Map(rows.map((row) => [row.typeId, row])), [rows]);
  const typeIds = useMemo(() => rows.map((row) => row.typeId), [rows]);
  const labels = useMemo(() => shortCompareLabels(rows.map((row) => row.itemName)), [rows]);

  const groups = useCompareAttributeGroups(rows, data);
  const { shown, hiddenCount } = useMemo(() => {
    if (!differencesOnly) return { shown: groups, hiddenCount: 0 };
    let hidden = 0;
    const kept = groups
      .map((group) => {
        const differing = group.rows.filter((row) => !isUniformRow(row, typeIds));
        hidden += group.rows.length - differing.length;
        return { ...group, rows: differing };
      })
      .filter((group) => group.rows.length > 0);
    return { shown: kept, hiddenCount: hidden };
  }, [groups, differencesOnly, typeIds]);

  function toggleCategory(category: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  const columns = useMemo<DataTableColumn<CompareAttributeRow>[]>(
    () => [
      {
        id: 'attribute',
        header: t('market.compare.attributeColumn'),
        // Pinned, so the attribute still says which row you are on however
        // far the item columns have scrolled sideways under it.
        className:
          'sticky left-0 z-10 w-(--compare-attribute-width) bg-panel whitespace-normal wrap-anywhere text-text-dim',
        render: (row) => row.name,
      },
      ...rows.map((row): DataTableColumn<CompareAttributeRow> => ({
        id: `item-${row.typeId}`,
        header: row.itemName,
        // Centred under the header's centred icon and label.
        align: 'center',
        className: 'w-(--compare-item-width) tabular-nums wrap-anywhere',
        render: (attrRow) => {
          const cell = attrRow.cells.get(row.typeId);
          const compareRow = rowsByTypeId.get(row.typeId);
          return cell ? formatCell(attrRow.kind, cell) : emptyCell(attrRow.kind, compareRow!);
        },
      })),
    ],
    [rows, rowsByTypeId, t]
  );

  return (
    // No scroller of its own: the drawer's body scrolls both ways, so the
    // header row sticks to its top and the attribute column to its left, and
    // every category scrolls sideways together. The widths narrow below
    // `sm` so five items fit a 390px phone without scrolling.
    <div
      className="space-y-3 [--compare-attribute-width:6rem] [--compare-item-width:4.5rem] sm:[--compare-attribute-width:12rem] sm:[--compare-item-width:8rem]"
      style={
        {
          '--compare-matrix-width': `calc(var(--compare-attribute-width) + ${rows.length} * var(--compare-item-width))`,
        } as CSSProperties
      }
    >
      <div className="sticky left-0 flex w-fit max-w-full flex-wrap items-center gap-x-3 gap-y-1">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold md:min-h-0">
          <Checkbox
            checked={differencesOnly}
            disabled={rows.length < 2}
            onChange={() => setDifferencesOnly((v) => !v)}
          />
          {t('market.compare.differencesOnly')}
        </label>
        {hiddenCount > 0 && (
          <span className="text-xs text-text-dim">
            {t('market.compare.identicalHidden', { count: hiddenCount })}
          </span>
        )}
      </div>
      {/* The one visible header row: each item's icon (its remove control on
          the corner) over the words that tell it apart from the others. */}
      <table
        aria-label={t('market.compare.itemsHeader')}
        className="sticky top-0 z-20 w-(--compare-matrix-width) table-fixed border-b border-line bg-panel text-xs"
      >
        <thead>
          <tr className="text-text-dim">
            <th
              scope="col"
              // The shared words read as a name, so they keep their own case;
              // capitalised, "AFTERBURNER" alone overflows a 6rem phone column.
              className={`sticky left-0 z-10 w-(--compare-attribute-width) bg-panel px-2 py-1 text-left align-bottom font-semibold break-words hyphens-auto ${labels.shared ? 'text-text' : 'uppercase'}`}
            >
              {labels.shared ?? t('market.compare.attributeColumn')}
            </th>
            {rows.map((row, index) => (
              <th
                key={row.typeId}
                scope="col"
                className="w-(--compare-item-width) px-1 pt-2 pb-1 align-bottom font-semibold text-text"
              >
                <span className="flex flex-col items-center gap-1 text-center">
                  {onRemove ? (
                    <RemovableTypeIcon
                      typeId={row.typeId}
                      itemName={row.itemName}
                      onRemove={onRemove}
                      sizeClassName="size-7"
                    />
                  ) : (
                    <TypeIcon typeId={row.typeId} size={64} className="size-7 rounded-xs" />
                  )}
                  <span className="max-w-full break-words hyphens-auto">
                    {labels.shared ? (
                      // The column shows only the shared-words-stripped label;
                      // the tooltip carries the full name on hover or focus.
                      <Tooltip content={row.itemName}>
                        <MarketItemLink typeId={row.typeId}>
                          <span aria-hidden="true">{labels.labels[index]}</span>
                          <span className="sr-only">{row.itemName}</span>
                        </MarketItemLink>
                      </Tooltip>
                    ) : (
                      <MarketItemLink typeId={row.typeId}>{row.itemName}</MarketItemLink>
                    )}
                  </span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
      </table>
      {shown.length === 0 ? (
        <p className="sticky left-0 text-xs text-text-dim">{t('market.compare.noDifferences')}</p>
      ) : (
        shown.map((group) => {
          const isCollapsed = collapsed.has(group.category);
          return (
            <section key={group.category}>
              {/* Pinned left: the heading sits above the full scrolling
                  width, so it would otherwise slide away with the columns. */}
              <h3 className="sticky left-0 mb-1 inline-block bg-panel pr-3">
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  onClick={() => toggleCategory(group.category)}
                  className={`flex min-h-11 items-center gap-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase hover:text-text md:min-h-0 ${interactiveClassName} ${focusRingClassName}`}
                >
                  <Caret expanded={!isCollapsed} />
                  {group.category}
                  {isCollapsed && (
                    <>
                      {' '}
                      <span className="font-normal tracking-normal normal-case">
                        {t('market.compare.rowCount', { count: group.rows.length })}
                      </span>
                    </>
                  )}
                </button>
              </h3>
              {!isCollapsed && (
                <DataTable
                  {...tableExport?.tableProps}
                  columns={columns}
                  rows={group.rows}
                  rowKey={(row) => row.key}
                  label={group.category}
                  density="compact"
                  // A real matrix at every width, never the stacked card:
                  // comparing means reading across a row.
                  responsive="table"
                  // Fixed widths so every category lines up under the one
                  // header row above, whose names this table's own (hidden)
                  // header repeats for assistive tech. Important, to beat
                  // DataTable's own `w-full`, which otherwise squeezes every
                  // column to the screen. Not `table-fixed`: that sizes
                  // columns from the hidden header row, whose widths
                  // `sr-only` erases.
                  className="w-(--compare-matrix-width)! [&_thead]:sr-only"
                />
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
