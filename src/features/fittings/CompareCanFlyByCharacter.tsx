/**
 * "All Characters" popover on a compare column header: whether each Character
 * on the account can fly that Fitting, not just the active one. The rows are
 * worked out only while the popover is open (Radix unmounts closed content)
 * and cached per Fitting + Character, so reopening — or adding a third slot —
 * never redoes a check.
 */
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger, Spinner } from '@/components/ui';
import type { Fitting } from '@/engine/fittings/types';
import { canFlyForCharacter } from './canFlyForCharacter';

export interface CompareCharacter {
  characterId: number;
  name: string;
}

type RowState = boolean | 'failed';

function CharacterRows({
  fitting,
  characters,
}: {
  fitting: Fitting;
  characters: readonly CompareCharacter[];
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ReadonlyMap<number, RowState>>(new Map());
  useEffect(() => {
    let cancelled = false;
    for (const { characterId } of characters) {
      canFlyForCharacter(fitting, characterId)
        .then((flies): RowState => flies)
        .catch((): RowState => 'failed')
        .then((state) => {
          if (!cancelled) setRows((prev) => new Map(prev).set(characterId, state));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [fitting, characters]);
  return (
    <ul className="space-y-1">
      {characters.map(({ characterId, name }) => {
        const state = rows.get(characterId);
        return (
          <li key={characterId} className="flex items-center justify-between gap-4">
            <span className="truncate text-text">{name}</span>
            {state === undefined ? (
              <Spinner size="sm" label={t('fittings.compare.canFlyLoading')} />
            ) : state === 'failed' ? (
              <span className="text-text-dim">{t('fittings.compare.canFlyCharacterFailed')}</span>
            ) : (
              <span className={state ? 'text-success' : 'text-danger'}>
                {state ? t('fittings.compare.canFlyYes') : t('fittings.compare.canFlyNo')}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function CompareCanFlyByCharacter({
  fitting,
  characters,
}: {
  fitting: Fitting;
  characters: readonly CompareCharacter[];
}) {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={inlineLinkClassName}>
          {t('fittings.compare.canFlyAllCharacters')}
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={t('fittings.compare.canFlyAllCharactersTitle', { fitting: fitting.name })}
        className="p-3"
      >
        <CharacterRows fitting={fitting} characters={characters} />
      </PopoverContent>
    </Popover>
  );
}
