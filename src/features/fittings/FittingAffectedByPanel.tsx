/**
 * "Affected by" in a fitted module's dialog: each of the module's attributes
 * that something changed, from its base to its value, with every modifier
 * the engine applied — which skill, hull bonus, module, charge, projected
 * effect or fleet boost, how it changes it, and any stacking penalty. Worked
 * out on demand, under exactly what the stats are (`explainModule`). Only what
 * moves a number is listed: an attribute that reads the same before and after
 * (a launcher's 0 HP damage — the charge carries it) and a source that isn't
 * running are left out.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AffectedAttribute, AffectedSource } from '@/engine/fittings/affectedBy';
import { displaySourceValue } from '@/engine/fittings/attributeUnits';
import { attributeValueText, formatAttributeNumber } from './attributeValueText';
import { useAttributeDictionary } from './useAttributeDictionary';
import { fixed0 } from '@/lib/fixedFormat';

function AffectedSourceLine({
  source,
  unitId,
  typeName,
}: {
  source: AffectedSource;
  /** The attribute's unit: an assigned or added value is in it. */
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
  /** `workspace.explainModule`; null while the engine or the pilot isn't ready. */
  explain: ((moduleIndex: number) => Promise<AffectedAttribute[]>) | null;
  moduleIndex: number;
  typeName: (typeId: number) => string;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AffectedAttribute[] | null>(null);
  const [failed, setFailed] = useState(false);
  const dictionary = useAttributeDictionary();

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for a new module or calculation, not a render-time derivation
    setRows(null);
    setFailed(false);
    if (explain === null) return;
    explain(moduleIndex).then(
      (result) => {
        if (!cancelled) setRows(result);
      },
      () => {
        if (!cancelled) setFailed(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [explain, moduleIndex]);

  if (failed) return <p className="text-xs text-danger">{t('fittings.affectedBy.failed')}</p>;
  if (rows === null || dictionary === null)
    return <p className="text-xs text-text-dim">{t('fittings.affectedBy.loading')}</p>;
  // Published attributes only: one the dictionary can't name isn't one the game shows.
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
