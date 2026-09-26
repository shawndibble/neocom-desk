/**
 * "Affected by" in a fitted module's dialog: each of the module's attributes
 * that something changed, from its base to its value, with every modifier
 * the engine applied — which skill, hull bonus, module, charge, projected
 * effect or fleet boost, how it changes it, and any stacking penalty. Worked
 * out on demand, under exactly what the stats are (`explainModule`).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AffectedAttribute, AffectedSource } from '@/engine/fittings/affectedBy';
import { displayAttributeValue, displaySourceValue } from '@/engine/fittings/attributeUnits';
import { loadAttributeDictionary } from '@/sde/loadMarketSde';
import type { AttributeDictionary } from '@/sde/marketTypes';

/** Enough precision for a multiplier like ×0.869 without trailing noise. */
function formatNumber(value: number): string {
  return Number(value.toPrecision(4)).toString();
}

function SourceLine({
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
  const shown = formatNumber(displaySourceValue(source.operator, source.value, unitId));
  const who =
    source.typeId !== null
      ? typeName(source.typeId)
      : t(`fittings.affectedBy.kind.${source.kind}`, { id: source.buffId });
  return (
    <li className={`flex justify-between gap-2 ${source.applied ? '' : 'text-text-dim'}`}>
      <span className="min-w-0">
        <span className="text-text-dim">
          {t(`fittings.affectedBy.kind.${source.kind}`, { id: source.buffId })}
        </span>{' '}
        {source.typeId !== null && who}
        {!source.applied && ` · ${t('fittings.affectedBy.notApplied')}`}
      </span>
      <span className="shrink-0 text-right tabular-nums">
        {t(`fittings.affectedBy.operator.${source.operator}`, {
          value: shown,
          defaultValue: shown,
        })}
        {source.penalty !== null && (
          <span className="block text-text-dim">
            {t('fittings.affectedBy.penalty', { pct: (source.penalty * 100).toFixed(0) })}
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
  const [dictionary, setDictionary] = useState<AttributeDictionary | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadAttributeDictionary().then(
      (loaded) => {
        if (!cancelled) setDictionary(loaded);
      },
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, []);

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
  const named = rows.filter((row) => dictionary[row.attributeId] !== undefined);
  if (named.length === 0)
    return <p className="text-xs text-text-dim">{t('fittings.affectedBy.none')}</p>;

  return (
    <ul className="space-y-2 text-xs">
      {named.map((row) => {
        const entry = dictionary[row.attributeId]!;
        // As the game shows it: a rate of fire in seconds, not milliseconds; a resonance as a resistance.
        const shown = (value: number) => {
          const display = displayAttributeValue(value, entry.unitId, entry.unit);
          return `${formatNumber(display.value)}${display.unit ? ` ${display.unit}` : ''}`;
        };
        return (
          <li key={row.attributeId} className="space-y-1 rounded-xs bg-panel-2 p-2">
            <div className="flex justify-between gap-2 font-semibold">
              <span className="min-w-0">{entry.name}</span>
              <span className="shrink-0 tabular-nums">
                {t('fittings.affectedBy.change', {
                  base: shown(row.base),
                  value: shown(row.value),
                })}
              </span>
            </div>
            <ul className="space-y-0.5">
              {row.sources.map((source, index) => (
                <SourceLine key={index} source={source} unitId={entry.unitId} typeName={typeName} />
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
