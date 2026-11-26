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
  rows: readonly CompareRow[];
  data: CompareAttributesData;
  tableExport?: UseTableExport<CompareAttributeRow>;
  onRemove?: (typeId: number) => void;
}

function formatCell(kind: 'price' | 'attribute', cell: CompareCell): ReactNode {
  if (kind === 'price')
    return <IskAmount value={cell.value} decimals={marketIskDecimals(cell.value)} />;
  return (
    cell.displayValue ??
    `${formatAttributeValue(cell.value, cell.unit)}${cell.unit ? ` ${cell.unit}` : ''}`
  );
}

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
        className:
          'sticky left-0 z-10 w-(--compare-attribute-width) bg-panel whitespace-normal wrap-anywhere text-text-dim',
        render: (row) => row.name,
      },
      ...rows.map((row): DataTableColumn<CompareAttributeRow> => ({
        id: `item-${row.typeId}`,
        header: row.itemName,
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
    <div
      className="space-y-3 [--compare-attribute-width:6rem] [--compare-item-width:4.5rem] sm:[--compare-attribute-width:12rem] sm:[--compare-item-width:8rem]"
      style={
        {
          '--compare-matrix-width': `calc(var(--compare-attribute-width) + ${rows.length} * var(--compare-item-width))`,
        } as CSSProperties
      }
    >
      <div className="sticky left-0 flex w-fit max-w-full flex-wrap items-center gap-x-3 gap-y-1">
        <label className="flex min-h-9 cursor-pointer items-center gap-2 text-xs font-semibold md:min-h-0">
          <Tooltip content={rows.length < 2 ? t('market.compare.differencesNeedsTwo') : null}>
            <Checkbox
              checked={differencesOnly}
              aria-disabled={rows.length < 2 || undefined}
              onChange={() => {
                if (rows.length >= 2) setDifferencesOnly((v) => !v);
              }}
            />
          </Tooltip>
          {t('market.compare.differencesOnly')}
        </label>
        {hiddenCount > 0 && (
          <span className="text-xs text-text-dim">
            {t('market.compare.identicalHidden', { count: hiddenCount })}
          </span>
        )}
      </div>
      <table
        aria-label={t('market.compare.itemsHeader')}
        className="sticky top-0 z-20 w-(--compare-matrix-width) table-fixed border-b border-line bg-panel text-xs"
      >
        <thead>
          <tr className="text-text-dim">
            <th
              scope="col"
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
              <h3 className="sticky left-0 mb-1 inline-block bg-panel pr-3">
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  onClick={() => toggleCategory(group.category)}
                  className={`flex min-h-9 items-center gap-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase hover:text-text md:min-h-0 ${interactiveClassName} ${focusRingClassName}`}
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
                  responsive="table"
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
