import { DAY_MS, MINUTE_MS } from './timeConstants.js';

export const SAME_TRANSFER_MS = 10 * MINUTE_MS;
export const STATED_TRANSFER_MS = 2 * DAY_MS;
export const PAYOUT_LINK_WINDOW_DAYS = 3;

interface Transfer {
  characterId?: number;
  amount: number;
  at: string;
}

const sameSenderAndAmount = (a: Transfer, b: Transfer) =>
  a.characterId !== undefined &&
  a.characterId === b.characterId &&
  Math.abs(a.amount - b.amount) < 1;

export function isSameJournalTransfer(held: Transfer, made: Transfer): boolean {
  return (
    sameSenderAndAmount(held, made) &&
    Math.abs(Date.parse(held.at) - Date.parse(made.at)) <= SAME_TRANSFER_MS
  );
}

export function matchesStatedTransfer(stated: Transfer, held: Transfer): boolean {
  return (
    sameSenderAndAmount(stated, held) &&
    Math.abs(Date.parse(stated.at) - Date.parse(held.at)) <= STATED_TRANSFER_MS
  );
}
