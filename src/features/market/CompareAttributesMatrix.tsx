/**
 * The Compare drawer's Attributes view (issue #1425, folded in from the old
 * `VariationsCompareModal`, issue #146): items as columns, dogma attributes
 * as rows grouped by category (`src/engine/market/attributeCompareMatrix.ts`),
 * mirroring the EVE client's own Variations-tab Compare flow. Dogma is
 * fetched by `useCompareAttributes` in the caller; this component is pure
 * render once that data has arrived.
 *
 * One `DataTable` per attribute category (issue #1128), so the matrix
 * inherits the default below-`sm` stack — a card per attribute, one labelled
 * line per item — rather than showing two of a large group's 96px columns at
 * a time. Same trade DESIGN.md §4a records for `SkillCompare` in #406. §4a's
 * one-DOM rule forbids a `sm:hidden` pair, so the header loses its 32px
 * `TypeIcon`: `DataTableColumn.header` is a string, and the stacked label is
 * CSS `content: attr(data-label)`.
 *
 * At `sm` and up the item names sit once, in one sticky header row above
 * every category, rather than atop each category's table: a matrix with a
 * dozen categories otherwise repeated every name a dozen times. Each
 * category table keeps its own header row for assistive tech (visually
 * hidden), and every table takes the same explicit column widths (the
 * `--compare-*-width` variables below) so the columns line up under the one
 * header.
 */
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, IconButton } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { DataTableColumn } from '@/components/ui';
import { IskAmount } from '@/components/ui';
import type { UseTableExport } from '@/components/ui/useTableExport';
import type { CompareAttributeRow, CompareCell } from '@/engine/market/attributeCompareMatrix';
import type { CompareAttributesData } from './useCompareAttributes';
import type { CompareRow } from './useCompareRows';
import { formatAttributeValue } from './format';
import { useCompareAttributeGroups } from './useCompareAttributesExport';

export interface CompareAttributesMatrixProps {
  /** The drawer's own price rows — one per Compare Set item, loading state and best-sell summary included. */
  rows: readonly CompareRow[];
  data: CompareAttributesData;
  /**
   * The drawer's export for this matrix (`useCompareAttributesExport`), so
   * every category's table offers the one whole-matrix export.
   */
  tableExport?: UseTableExport<CompareAttributeRow>;
  /** Drops an item from the Compare Set — the header's hover "x". */
  onRemove?: (typeId: number) => void;
}

/** Column widths, shared through CSS variables by the header row and every category table so they line up. */
const ATTRIBUTE_WIDTH = '12rem';
const ITEM_WIDTH = '8rem';

/** A price is shorthand — the whole table is a side-by-side scan — with the exact figure one gesture away; an attribute keeps its own unit and precision. */
function formatCell(kind: 'price' | 'attribute', cell: CompareCell): ReactNode {
  if (kind === 'price') return <IskAmount value={cell.value} revealOn="tap" />;
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

  const rowsByTypeId = useMemo(() => new Map(rows.map((row) => [row.typeId, row])), [rows]);

  const groups = useCompareAttributeGroups(rows, data);

  const columns = useMemo<DataTableColumn<CompareAttributeRow>[]>(
    () => [
      {
        id: 'attribute',
        header: t('market.compare.attributeColumn'),
        primary: true,
        // The `sm:` half is the desktop matrix, and `sm` is where `.dt-stack`
        // stops (`width < 40rem`): pinned, so the attribute still says which
        // row you are on many columns to the right, and dim, as a row label
        // beside its values. Once it titles a card instead, dim would make
        // the one line naming the card the quietest thing on it.
        className:
          'whitespace-nowrap sm:sticky sm:left-0 sm:z-10 sm:w-(--compare-attribute-width) sm:bg-panel sm:whitespace-normal sm:wrap-anywhere sm:text-text-dim',
        render: (row) => row.name,
      },
      ...rows.map((row): DataTableColumn<CompareAttributeRow> => ({
        id: `item-${row.typeId}`,
        header: row.itemName,
        align: 'right',
        className: 'tabular-nums sm:w-(--compare-item-width)',
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
    // every category scrolls sideways together.
    <div
      className="space-y-3"
      style={
        {
          '--compare-attribute-width': ATTRIBUTE_WIDTH,
          '--compare-item-width': ITEM_WIDTH,
          '--compare-matrix-width': `calc(${ATTRIBUTE_WIDTH} + ${rows.length} * ${ITEM_WIDTH})`,
        } as CSSProperties
      }
    >
      {/* The one visible header row. Hidden below `sm`, where each card
          already labels its lines with the item names. */}
      <table
        aria-label={t('market.compare.itemsHeader')}
        className="sticky top-0 z-20 hidden w-(--compare-matrix-width) table-fixed border-b border-line bg-panel text-xs sm:table"
      >
        <thead>
          <tr className="text-text-dim">
            <th
              scope="col"
              className="sticky left-0 z-10 w-(--compare-attribute-width) bg-panel px-2 py-1 text-left align-bottom font-semibold uppercase"
            >
              {t('market.compare.attributeColumn')}
            </th>
            {rows.map((row) => (
              <th
                key={row.typeId}
                scope="col"
                className={`group relative w-(--compare-item-width) px-2 pb-1 text-right align-bottom font-semibold uppercase ${onRemove ? 'pt-6' : 'pt-1'}`}
              >
                <span className="inline-block max-w-28 break-words">{row.itemName}</span>
                {onRemove && (
                  // In a strip of its own above the name (`pt-6`), so neither
                  // squeezes the name's width nor covers a long name's first
                  // line; revealed on hover or keyboard focus, never removed
                  // from the tab order — and always shown on a touch screen,
                  // which has no hover to reveal it.
                  <IconButton
                    size="sm"
                    variant="plain"
                    icon={<Icon.Close />}
                    label={t('market.compare.remove', { name: row.itemName })}
                    onClick={() => onRemove(row.typeId)}
                    className="absolute top-0.5 right-0.5 bg-panel opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
      </table>
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
            {...tableExport?.tableProps}
            columns={columns}
            rows={group.rows}
            rowKey={(row) => row.key}
            label={group.category}
            density="compact"
            // Fixed widths so every category lines up under the one header
            // row above, whose names this table's own (hidden) header repeats.
            className="sm:w-(--compare-matrix-width) sm:[&_thead]:sr-only"
          />
        </section>
      ))}
    </div>
  );
}
