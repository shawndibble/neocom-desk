/** "Modules that differ": one row per module type not shared identically across every compared Fitting. */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TypeIcon } from '@/components/ui';
import type { ModuleDiffEntry } from '@/engine/fittings/fittingCompare';
import { typeName } from '@/sde/loadSde';

export interface FittingCompareModulesSummaryProps {
  entries: readonly ModuleDiffEntry[];
  /** Which columns to render, as positions in `entry.counts` (null: stats failed, shown as a dash) — matches the table's own phone window. */
  visible: readonly (number | null)[];
}

export function FittingCompareModulesSummary({
  entries,
  visible,
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
    <ul className="space-y-1 text-xs">
      {entries.map((entry) => (
        <li key={entry.typeId} className="flex items-center gap-2">
          <TypeIcon typeId={entry.typeId} size={32} className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {names.get(entry.typeId) ?? `Type ${entry.typeId}`}
          </span>
          <span className="flex shrink-0 gap-3 tabular-nums text-text-dim">
            {visible.map((position, column) => (
              <span key={column}>{position === null ? '—' : (entry.counts[position] ?? 0)}</span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}
