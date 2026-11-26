import { characterIdsOfMiner } from '@/engine/corpTaxBook/charges';
import type { CorpBookViewBook } from './corpBookView';

export interface MinerPayCode {
  code: string;
  character: string;
  characterIds: number[];
}

export function suggestedCode(
  codes: readonly MinerPayCode[],
  payerId: number | undefined
): MinerPayCode | undefined {
  if (payerId !== undefined) return codes.find((c) => c.characterIds.includes(payerId));
  return codes.length === 1 ? codes[0] : undefined;
}

export function minerPayCodes(
  book: CorpBookViewBook,
  nameOf: (characterId: number) => string | undefined
): MinerPayCode[] {
  return book.summary.miners.map((m) => {
    const characterIds = characterIdsOfMiner(m.minerId, book.loaded.miners);
    return {
      code: m.code,
      character: characterIds.map((id) => nameOf(id) ?? `#${id}`).join(', '),
      characterIds,
    };
  });
}
