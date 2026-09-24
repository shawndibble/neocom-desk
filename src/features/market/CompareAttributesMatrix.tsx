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
 */
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import { IskAmount } from '@/components/ui';
import {
  buildCompareMatrix,
  type CompareAttributeGroup,
  type CompareAttributeRow,
  type CompareCell,
} from '@/engine/market/attributeCompareMatrix';
import type { CompareAttributesData } from './useCompareAttributes';
import type { CompareRow } from './useCompareRows';
import { formatAttributeValue } from './format';

export interface CompareAttributesMatrixProps {
  /** The drawer's own price rows — one per Compare Set item, loading state and best-sell summary included. */
  rows: readonly CompareRow[];
  data: CompareAttributesData;
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
 * What an absent cell reads as. A price this row's own `useCompareRows` fetch
 * hasn't resolved yet gets "…" — it's still on its way — while an attribute
 * the item simply doesn't have, or a price fetch that resolved to nothing, is
 * always "—".
 */
function emptyCell(kind: 'price' | 'attribute', row: CompareRow): string {
  return kind === 'price' && row.loading ? '…' : '—';
}

export function CompareAttributesMatrix({ rows, data }: CompareAttributesMatrixProps) {
  const { t } = useTranslation();

  const rowsByTypeId = useMemo(() => new Map(rows.map((row) => [row.typeId, row])), [rows]);

  const groups = useMemo<CompareAttributeGroup[]>(() => {
    const matrixItems = rows.map((row) => ({
      typeId: row.typeId,
      dogmaAttributes: data.dogmaByTypeId.get(row.typeId),
      bestSell: row.summary?.bestSell,
    }));
    return buildCompareMatrix(
      matrixItems,
      data.dictionary,
      {
        worth: t('market.compare.worth'),
        estimatedPrice: t('market.compare.estimatedPrice'),
      },
      data.names
    );
  }, [rows, data, t]);

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
        className: 'whitespace-nowrap sm:sticky sm:left-0 sm:z-10 sm:bg-panel sm:text-text-dim',
        // A floor, so the pinned gutter is the same width in every category —
        // each table sizes its own columns off its own longest name.
        headerClassName: 'sm:sticky sm:left-0 sm:z-10 sm:bg-panel sm:min-w-40',
        render: (row) => row.name,
      },
      ...rows.map((row): DataTableColumn<CompareAttributeRow> => ({
        id: `item-${row.typeId}`,
        header: row.itemName,
        align: 'right',
        className: 'tabular-nums',
        // A large variation group compresses to ~50px per column without a
        // floor — narrower than the figures they hold.
        headerClassName: 'sm:min-w-24',
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
            // the table may outgrow the drawer.
            className="sm:min-w-max"
          />
        </section>
      ))}
    </div>
  );
}
