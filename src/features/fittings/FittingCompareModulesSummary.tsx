/** "Modules that differ": one row per module type not shared identically across every compared Fitting. */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TypeIcon } from '@/components/ui';
import type { FittingCompareColumn } from './FittingCompareTable';
import type { ModuleDiffEntry } from '@/engine/fittings/fittingCompare';
import { typeName } from '@/sde/loadSde';

export interface FittingCompareModulesSummaryProps {
  entries: readonly ModuleDiffEntry[];
  /** The stats table's own columns (`statsIndex` = position in `entry.counts`; null: stats failed, shown as a dash), so the phone window matches. */
  columns: readonly FittingCompareColumn[];
}

export function FittingCompareModulesSummary({
  entries,
  columns,
}: FittingCompareModulesSummaryProps) {
  const { t } = useTranslation();
  const [names, setNames] = useState<ReadonlyMap<number, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resolved = await Promise.all(
        entries.map(async (entry): Promise<[number, string]> => [
          entry.typeId,
          await typeName(entry.typeId),
        ])
      );
      if (!cancelled) setNames(new Map(resolved));
    })();
    return () => {
      cancelled = true;
    };
  }, [entries]);

  if (entries.length === 0) {
    return <p className="text-xs text-text-dim">{t('fittings.compare.modules.none')}</p>;
  }

  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr>
          <th className="p-2 text-left text-text-dim">{t('fittings.compare.moduleColumn')}</th>
          {columns.map((column) => (
            <th key={column.index} className="p-2 text-right text-text">
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.typeId} className="border-t border-line">
            <td className="p-2">
              <span className="flex items-center gap-2">
                <TypeIcon typeId={entry.typeId} size={32} className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {names.get(entry.typeId) ?? t('common.unknownType', { id: entry.typeId })}
                </span>
              </span>
            </td>
            {columns.map((column) => (
              <td key={column.index} className="p-2 text-right tabular-nums text-text-dim">
                {column.statsIndex === null ? '—' : (entry.counts[column.statsIndex] ?? 0)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
