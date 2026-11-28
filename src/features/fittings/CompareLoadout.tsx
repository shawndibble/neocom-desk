import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel, eyebrowClassName } from '@/components/ui';
import { loadoutDiff, type LoadoutEntry } from '@/engine/fittings/fittingCompare';
import type { Fitting } from '@/engine/fittings/types';
import { useTypeNames } from '@/features/character/useTypeNames';
import { cx } from '@/lib/cx';
import type { Translate } from '@/lib/translate';
import { typeNameOr } from '@/lib/typeNameOr';
import { CompareLetterTag } from './CompareCell';
import { COMPARE_GRID_CLASS, compareGridStyle, type CompareColumn } from './compareFormat';

function entryText(
  t: Translate,
  entry: LoadoutEntry,
  count: number,
  names: ReadonlyMap<number, string>
): string {
  const module = typeNameOr(t, names.get(entry.typeId), entry.typeId);
  const name =
    entry.chargeTypeId === undefined
      ? module
      : t('fittings.compare.loadoutWithCharge', {
          name: module,
          charge: typeNameOr(t, names.get(entry.chargeTypeId), entry.chargeTypeId),
        });
  return count > 1 ? t('fittings.compare.loadoutCount', { count, name }) : name;
}

function EntryLine({ text, changed }: { text: string; changed: boolean }) {
  const { t } = useTranslation();
  return (
    <li
      className={cx(
        'truncate border-l-2 pl-2',
        changed ? 'border-accent text-text' : 'border-transparent text-text-dim'
      )}
    >
      {text}
      {changed && <span className="sr-only"> ({t('fittings.compare.loadoutChanged')})</span>}
    </li>
  );
}

export function CompareLoadout({
  fittings,
  columns,
}: {
  fittings: readonly Fitting[];
  columns: readonly CompareColumn[];
}) {
  const { t } = useTranslation();
  const racks = useMemo(() => loadoutDiff(fittings), [fittings]);
  const typeIds = useMemo(
    () =>
      racks.flatMap(({ fits }) =>
        fits.flatMap((entries) =>
          entries.flatMap(({ typeId, chargeTypeId }) =>
            chargeTypeId === undefined ? [typeId] : [typeId, chargeTypeId]
          )
        )
      ),
    [racks]
  );
  const names = useTypeNames(typeIds);
  return (
    <Panel title={t('fittings.compare.loadoutTitle')} meta={t('fittings.compare.loadoutLegend')}>
      {racks.map(({ rack, fits }) => (
        <div
          key={rack}
          className={cx(COMPARE_GRID_CLASS, 'border-t border-line py-2 first:border-t-0')}
          style={compareGridStyle(columns.length)}
        >
          <h3 className={cx(eyebrowClassName, 'py-1')}>{t(`fittings.compare.rack.${rack}`)}</h3>
          {columns.map(({ letter, position }) => {
            const entries = position === null ? [] : (fits[position] ?? []);
            return (
              <div key={letter} className="flex gap-2 py-1 md:block">
                <CompareLetterTag letter={letter} />
                <ul className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                  {entries.length === 0 && <li className="pl-2.5 text-text-dim">—</li>}
                  {entries.flatMap((entry) => {
                    const key = `${entry.typeId}:${entry.chargeTypeId ?? ''}`;
                    const extra = entry.count - entry.shared;
                    return [
                      entry.shared > 0 && (
                        <EntryLine
                          key={`${key}:shared`}
                          text={entryText(t, entry, entry.shared, names)}
                          changed={false}
                        />
                      ),
                      extra > 0 && (
                        <EntryLine
                          key={`${key}:extra`}
                          text={entryText(t, entry, extra, names)}
                          changed
                        />
                      ),
                    ];
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      ))}
    </Panel>
  );
}
