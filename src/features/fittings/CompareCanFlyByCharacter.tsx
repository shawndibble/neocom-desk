import { useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger, Spinner } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import type { Fitting } from '@/engine/fittings/types';
import { cx } from '@/lib/cx';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { canFlyForCharacter } from './canFlyForCharacter';

export interface CompareCharacter {
  characterId: number;
  name: string;
}

type RowState = boolean | 'failed';

const fittingKeys = new WeakMap<Fitting, number>();
let nextFittingKey = 0;

function fittingKey(fitting: Fitting): number {
  let key = fittingKeys.get(fitting);
  if (key === undefined) {
    key = nextFittingKey++;
    fittingKeys.set(fitting, key);
  }
  return key;
}

function CharacterRows({
  fitting,
  characters,
}: {
  fitting: Fitting;
  characters: readonly CompareCharacter[];
}) {
  const { t } = useTranslation();
  const loader = useCallback(
    async (): Promise<ReadonlyMap<number, RowState>> =>
      new Map(
        await Promise.all(
          characters.map(async ({ characterId }): Promise<[number, RowState]> => {
            const flies = await canFlyForCharacter(fitting, characterId).catch(() => null);
            return [characterId, flies ?? 'failed'];
          })
        )
      ),
    [fitting, characters]
  );
  const { data: rows } = useKeyedLoad(
    `${fittingKey(fitting)}:${characters.map(({ characterId }) => characterId).join(',')}`,
    loader
  );
  return (
    <ul className="space-y-1">
      {characters.map(({ characterId, name }) => {
        const state = rows?.get(characterId);
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
  children,
  className,
}: {
  fitting: Fitting;
  characters: readonly CompareCharacter[];
  children?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cx(inlineLinkClassName, className)}>
          {children ?? t('fittings.compare.canFlyAllCharacters')}
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
