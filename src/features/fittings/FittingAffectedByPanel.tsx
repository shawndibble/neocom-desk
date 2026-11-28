import { useCallback } from 'react';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import { useTranslation } from 'react-i18next';
import type { AffectedAttribute, AffectedSource } from '@/engine/fittings/affectedBy';
import { displaySourceValue } from '@/engine/fittings/attributeUnits';
import { attributeValueText, formatAttributeNumber } from './attributeValueText';
import { useAttributeDictionary } from './useAttributeDictionary';
import { fixed0 } from '@/lib/fixedFormat';
import { Spinner } from '@/components/ui/Spinner';

function AffectedSourceLine({
  source,
  unitId,
  typeName,
}: {
  source: AffectedSource;
  unitId: number | undefined;
  typeName: (typeId: number) => string;
}) {
  const { t } = useTranslation();
  const shown = formatAttributeNumber(displaySourceValue(source.operator, source.value, unitId));
  const who =
    source.typeId !== null
      ? typeName(source.typeId)
      : t(`fittings.affectedBy.kind.${source.kind}`, { id: source.buffId });
  return (
    <li className="flex justify-between gap-2">
      <span className="min-w-0">
        <span className="text-text-dim">
          {t(`fittings.affectedBy.kind.${source.kind}`, { id: source.buffId })}
        </span>{' '}
        {source.typeId !== null && who}
      </span>
      <span className="shrink-0 text-right tabular-nums">
        {t(`fittings.affectedBy.operator.${source.operator}`, {
          value: shown,
          defaultValue: shown,
        })}
        {source.penalty !== null && (
          <span className="block text-text-dim">
            {t('fittings.affectedBy.penalty', { pct: fixed0(source.penalty * 100) })}
          </span>
        )}
      </span>
    </li>
  );
}

export function FittingAffectedByPanel({
  explain,
  moduleIndex,
  typeName,
}: {
  explain: ((moduleIndex: number) => Promise<AffectedAttribute[]>) | null;
  moduleIndex: number;
  typeName: (typeId: number) => string;
}) {
  const { t } = useTranslation();
  const dictionary = useAttributeDictionary();
  const load = useCallback(
    () => (explain === null ? Promise.resolve(null) : explain(moduleIndex)),
    [explain, moduleIndex]
  );
  const explained = useAsyncLoad(load);
  const failed = explained.status === 'failed';
  const rows = explained.data ?? null;

  if (failed) return <p className="text-xs text-danger">{t('fittings.affectedBy.failed')}</p>;
  if (rows === null || dictionary === null)
    return (
      <Spinner size="sm" showLabel label={t('fittings.affectedBy.loading')} className="text-xs" />
    );
  const shownRows = rows.flatMap((row) => {
    const entry = dictionary[row.attributeId];
    if (entry === undefined) return [];
    const base = attributeValueText(row.base, entry);
    const value = attributeValueText(row.value, entry);
    const sources = row.sources.filter((source) => source.applied);
    if (base === value || sources.length === 0) return [];
    return [{ row, entry, base, value, sources }];
  });
  if (shownRows.length === 0)
    return <p className="text-xs text-text-dim">{t('fittings.affectedBy.none')}</p>;

  return (
    <ul className="divide-y divide-line text-xs">
      {shownRows.map(({ row, entry, base, value, sources }) => (
        <li key={row.attributeId} className="py-2 first:pt-0 last:pb-0">
          <div className="flex justify-between gap-2 font-semibold">
            <span className="min-w-0">{entry.name}</span>
            <span className="shrink-0 tabular-nums">
              {t('fittings.affectedBy.change', { base, value })}
            </span>
          </div>
          <ul className="mt-1 space-y-0.5 pl-3">
            {sources.map((source, index) => (
              <AffectedSourceLine
                key={index}
                source={source}
                unitId={entry.unitId}
                typeName={typeName}
              />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
