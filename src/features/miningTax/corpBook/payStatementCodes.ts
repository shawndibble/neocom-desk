import { verifyPeriodLabel } from '@/features/corpTaxBook/verifyPeriodLabel';
import { characterIdsOfMiner } from '@/engine/corpTaxBook/charges';
import type { CorpBookViewBook } from './corpBookView';

export interface PayStatementCode {
  code: string;
  /** E.g. "Oct 2026". */
  period: string;
  /** Whose Statement it is: a main's and an alt's codes otherwise look the same (#6204). */
  character: string;
  /** The characters its Miner bills: a donation from one of them is credited to it. */
  characterIds: number[];
}

/**
 * The code to pre-fill as the Reason: the oldest open Statement of the paying character's Miner.
 * With no payer known and Statements of several Miners open, none: a code of another Miner's
 * Statement would not be credited to it (the book credits the sender's Miner).
 */
export function suggestedCode(
  codes: readonly PayStatementCode[],
  payerId: number | undefined
): PayStatementCode | undefined {
  if (payerId !== undefined) return codes.find((c) => c.characterIds.includes(payerId));
  const miners = new Set(codes.map((c) => c.characterIds.join(',')));
  return miners.size === 1 ? codes[0] : undefined;
}

/**
 * The codes the pay dialog offers: every Statement the book has not settled, oldest first, as
 * payments settle them. The Miner's name the officer stored with it, else its characters' names.
 */
export function payStatementCodes(
  book: CorpBookViewBook,
  nameOf: (characterId: number) => string | undefined,
  locale?: string
): PayStatementCode[] {
  return book.summary.openStatements.map((s) => {
    const stored = book.loaded.statements.find((x) => x.id === s.statementId)?.minerName;
    const characterIds = characterIdsOfMiner(s.minerId, book.loaded.miners);
    const character = stored ?? characterIds.map((id) => nameOf(id) ?? `#${id}`).join(', ');
    return {
      code: s.code,
      period: verifyPeriodLabel(s.periodStart, s.periodEnd, locale),
      character,
      characterIds,
    };
  });
}
