import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type CharacterRecord } from '@/db';

const NO_CHARACTERS: readonly CharacterRecord[] = [];

export function useCharacters(): readonly CharacterRecord[] {
  return useLiveQuery(() => db.characters.toArray(), [], NO_CHARACTERS);
}

export function useCharactersOrLoading(): CharacterRecord[] | undefined {
  return useLiveQuery(() => db.characters.toArray());
}

export function useCharacterNames(): Map<number, string> {
  const characters = useCharacters();
  return useMemo(() => new Map(characters.map((c) => [c.characterId, c.name])), [characters]);
}

export function useCharacterCount(): number {
  return useLiveQuery(() => db.characters.count(), [], 0);
}

export function useCharacterCountOrLoading(): number | undefined {
  return useLiveQuery(() => db.characters.count());
}

export interface CharacterCandidate {
  characterId: number;
  characterName: string;
}

export function useAccountCharacters(): {
  characters: readonly CharacterRecord[];
  namesById: Map<number, string>;
  candidates: CharacterCandidate[];
} {
  const characters = useCharacters();
  const namesById = useCharacterNames();
  const candidates = useMemo(
    () => characters.map((c) => ({ characterId: c.characterId, characterName: c.name })),
    [characters]
  );
  return { characters, namesById, candidates };
}
