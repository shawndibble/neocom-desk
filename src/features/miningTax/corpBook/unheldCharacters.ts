/**
 * The characters a corporation counts as the pilot's that the pilot does not hold in Neocom Desk
 * (decision 20261120-235011, "a warning when the corporation counts a character the pilot has not
 * added"): an officer grouped them with a held character, so the book bills them together, but
 * the Mining Tax page reads only held characters' lines. One entry per corporation. Pure.
 */
import type { Miner } from '@/engine/corpTaxBook/charges';

export interface UnheldCharacters {
  corporationId: number;
  corpName: string;
  /** The characters not held, in the order the Miners list them. */
  characterIds: number[];
  /** "Not yours?": each held character in such a Miner declines its link to it. */
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
