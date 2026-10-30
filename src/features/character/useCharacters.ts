import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type CharacterRecord } from '@/db';

/** Returned while the first read is in flight: one identity, so a dep array on it doesn't churn. */
const NO_CHARACTERS: readonly CharacterRecord[] = [];

/** Every Character on the device; empty (never `undefined`) until the live query resolves. */
export function useCharacters(): readonly CharacterRecord[] {
  return useLiveQuery(() => db.characters.toArray(), [], NO_CHARACTERS);
}

/** Like `useCharacters`, but `undefined` until loaded, so a gate can tell "none yet" from "none". */
export function useCharactersOrLoading(): CharacterRecord[] | undefined {
  return useLiveQuery(() => db.characters.toArray());
}

/** Character id -> name. Empty until loaded, so a miss reads as "unknown", not "no characters". */
export function useCharacterNames(): Map<number, string> {
  const characters = useCharacters();
  return useMemo(() => new Map(characters.map((c) => [c.characterId, c.name])), [characters]);
}

/** How many Characters are on the device; 0 until loaded. */
export function useCharacterCount(): number {
  return useLiveQuery(() => db.characters.count(), [], 0);
}

/** Like `useCharacterCount`, but `undefined` until loaded, so a gate can tell "none yet" from "none". */
export function useCharacterCountOrLoading(): number | undefined {
  return useLiveQuery(() => db.characters.count());
}

export interface CharacterCandidate {
  characterId: number;
  characterName: string;
}

/** The Character roster in the shapes the industry panels and asset reads build by hand. */
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
