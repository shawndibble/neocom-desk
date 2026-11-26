import type { Miner } from '@/engine/corpTaxBook/charges';

export interface UnheldCharacters {
  corporationId: number;
  corpName: string;
  characterIds: number[];
  declines: { characterId: number; minerId: string }[];
}

export function unheldCharacters(
  books: readonly { corporationId: number; corpName: string; miners: readonly Miner[] }[],
  held: ReadonlySet<number>
): UnheldCharacters[] {
  return books.flatMap(({ corporationId, corpName, miners }) => {
    const characterIds: number[] = [];
    const declines: UnheldCharacters['declines'] = [];
    for (const m of miners) {
      const mine = m.characterIds.filter((c) => held.has(c));
      const others = m.characterIds.filter((c) => !held.has(c));
      if (mine.length === 0 || others.length === 0) continue;
      for (const c of others) if (!characterIds.includes(c)) characterIds.push(c);
      for (const c of mine) declines.push({ characterId: c, minerId: m.id });
    }
    return characterIds.length > 0 ? [{ corporationId, corpName, characterIds, declines }] : [];
  });
}
