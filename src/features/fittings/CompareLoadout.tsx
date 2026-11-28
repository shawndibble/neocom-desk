import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel, eyebrowClassName } from '@/components/ui';
import { loadoutDiff, type LoadoutEntry } from '@/engine/fittings/fittingCompare';
import type { Fitting } from '@/engine/fittings/types';
import { cx } from '@/lib/cx';
import { CompareLetterTag } from './CompareFitCard';
import { COMPARE_GRID_CLASS, compareGridStyle } from './compareFormat';
import { useCompareTypeNames } from './useCompareTypeNames';

function entryText(entry: LoadoutEntry, count: number, names: ReadonlyMap<number, string>) {
  const name = names.get(entry.typeId) ?? `#${entry.typeId}`;
  const charge =
    entry.chargeTypeId === undefined
      ? ''
      : ` · ${names.get(entry.chargeTypeId) ?? `#${entry.chargeTypeId}`}`;
  return `${count > 1 ? `${count}× ` : ''}${name}${charge}`;
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
  letters,
}: {
  fittings: readonly Fitting[];
  letters: readonly string[];
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
  const names = useCompareTypeNames(typeIds);
  return (
    <Panel
      title={t('fittings.compare.loadoutTitle')}
      meta={
        <span className="flex items-center gap-1 text-xs text-text-dim">
          <span aria-hidden="true" className="inline-block h-3 w-0.5 bg-accent" />
          {t('fittings.compare.loadoutLegend')}
        </span>
      }
    >
      {racks.map(({ rack, fits }) => (
        <div
          key={rack}
          className={cx(COMPARE_GRID_CLASS, 'border-t border-line py-2 first:border-t-0')}
          style={compareGridStyle(letters.length)}
        >
          <h3 className={cx(eyebrowClassName, 'py-1')}>{t(`fittings.compare.rack.${rack}`)}</h3>
          {fits.map((entries, index) => (
            <div key={letters[index]} className="flex gap-2 py-1 md:block">
              <CompareLetterTag letter={letters[index]!} />
              <ul className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                {entries.length === 0 && <li className="pl-2.5 text-text-dim">—</li>}
                {entries.flatMap((entry) => {
                  const key = `${entry.typeId}:${entry.chargeTypeId ?? ''}`;
                  const extra = entry.count - entry.shared;
                  return [
                    entry.shared > 0 && (
                      <EntryLine
                        key={`${key}:shared`}
                        text={entryText(entry, entry.shared, names)}
                        changed={false}
                      />
                    ),
                    extra > 0 && (
                      <EntryLine
                        key={`${key}:extra`}
                        text={entryText(entry, extra, names)}
                        changed
                      />
                    ),
                  ];
                })}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </Panel>
  );
}
