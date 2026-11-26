import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { totalSystemUnread } from '@/engine/mail/mail';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useUrlParams } from '@/lib/useUrlState';
import { readMailLabelsForCharacters } from './mail';
import { characterFilterParam } from './characterFilterUrlParam';
import type { CharacterFilterValue } from './characterFilterValue';
import { useMailScope } from './mailScopePref';
import { useCharacters } from './useCharacters';

export function useMailScopeSwitch() {
  const storedScope = useMailScope((state) => state.value);
  const setStoredScope = useMailScope((state) => state.setValue);
  const scopeHydrated = useHydratedStore(useMailScope);
  const scopeParams = useMemo(() => ({ scope: characterFilterParam(storedScope) }), [storedScope]);
  const [scopeView, setScopeView] = useUrlParams(scopeParams);

  const characters = useCharacters();
  const labelsByCharacter = useLiveQuery(
    async () => readMailLabelsForCharacters(characters.map((c) => c.characterId)),
    [characters]
  );
  const unreadByCharacter = useMemo(
    () =>
      characters.map((c) => ({
        characterId: c.characterId,
        name: c.name,
        unread: totalSystemUnread(labelsByCharacter?.get(c.characterId)?.data.labels ?? []),
      })),
    [characters, labelsByCharacter]
  );

  const offered = characters.length > 1;
  const scope: CharacterFilterValue = offered ? scopeView.scope : 'current';
  function changeScope(next: CharacterFilterValue) {
    void setStoredScope(next);
    setScopeView({ scope: next });
  }

  return {
    scope,
    scopeHydrated,
    offered,
    characterCount: characters.length,
    unreadByCharacter,
    changeScope,
  };
}
