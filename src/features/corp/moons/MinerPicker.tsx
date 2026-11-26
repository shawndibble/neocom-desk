import { useMemo, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Radio, SearchInput } from '@/components/ui';
import { selectedRowClassName, tappableRowClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';

interface PickableMiner {
  id: string;
  mainCharacterId: number;
  characterIds: readonly number[];
}

export function MinerPicker({
  miners,
  nameOf,
  value,
  onChange,
  filterRef,
}: {
  miners: readonly PickableMiner[];
  nameOf: (characterId: number) => string;
  value: string;
  onChange: (id: string) => void;
  filterRef?: Ref<HTMLInputElement>;
}) {
  const { t } = useTranslation();
  const k = 'corpTaxBook.moons.dialogs.assign';
  const [query, setQuery] = useState('');
  const sorted = useMemo(
    () =>
      miners
        .map((m) => ({ id: m.id, name: nameOf(m.mainCharacterId), m }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [miners, nameOf]
  );
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? sorted.filter(
        ({ id, name, m }) =>
          id === value ||
          name.toLowerCase().includes(needle) ||
          m.characterIds.some((c) => nameOf(c).toLowerCase().includes(needle))
      )
    : sorted;
  return (
    <div className="space-y-1.5">
      <SearchInput
        ref={filterRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t(`${k}.find`)}
        aria-label={t(`${k}.find`)}
      />
      {shown.length === 0 ? (
        <p className="text-xs text-text-dim">{t(`${k}.noMatch`)}</p>
      ) : (
        <ul
          role="radiogroup"
          aria-label={t(`${k}.miner`)}
          className="max-h-56 divide-y divide-line overflow-y-auto rounded-xs border border-line bg-panel-2"
        >
          {shown.map(({ id, name }) => {
            const on = id === value;
            return (
              <li key={id}>
                <label
                  className={cx(
                    'flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs',
                    tappableRowClassName,
                    on && selectedRowClassName
                  )}
                >
                  <Radio name="assign-miner" checked={on} onChange={() => onChange(id)} />
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
