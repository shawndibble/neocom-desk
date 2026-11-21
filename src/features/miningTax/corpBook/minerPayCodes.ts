import { characterIdsOfMiner } from '@/engine/corpTaxBook/charges';
import type { CorpBookViewBook } from './corpBookView';

/** A Reason code the pay dialog offers: one per Miner of the member's (`minerPaymentCode`). */
export interface MinerPayCode {
  code: string;
  /** Whose Miner it is: a main's and an alt's codes otherwise look the same (#6204). */
  character: string;
  /** The characters its Miner bills: a donation from one of them is credited to it. */
  characterIds: number[];
}

/**
 * The code to pre-fill as the Reason: the paying character's Miner's own. With no payer known
 * and several Miners, none: another Miner's code would not be credited to the payer's.
 */
export function suggestedCode(
  codes: readonly MinerPayCode[],
  payerId: number | undefined
): MinerPayCode | undefined {
  if (payerId !== undefined) return codes.find((c) => c.characterIds.includes(payerId));
  return codes.length === 1 ? codes[0] : undefined;
}

/**
 * The codes the pay dialog offers: one per Miner of the member's in the book, whether or not a
 * Late notice is open. Money pays the Miner's oldest unpaid day whatever code it carries; the code
 * only says whose money it is.
 */
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
