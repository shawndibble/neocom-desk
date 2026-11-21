// Whether two records are the same ISK transfer (decision 20261120-235011, "one rule per
// question"). The client and the Cloud Functions import it; dependency-free. Each rule is named for
// what it decides, because the questions differ in how far apart the two records can be:
//
// - `isSameJournalTransfer`: two wallet journals (the corporation's and the member's own) stamp
//   one donation within a minute or two of each other, to the ISK.
// - `matchesStatedTransfer`: a transfer a person states (a member's "I already paid", an officer's
//   hand record) against one the book holds. The stated time is a day, a time zone or a guess
//   away, so it allows two days either way.
// - `PAYOUT_LINK_WINDOW_DAYS`: a Collector's recorded payout to a moon owner against the outgoing
//   journal entry. The Collector chose the amount, so it must be exact; both sides are dates, so
//   the window is whole days.

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** How far apart two journals stamp one transfer. */
export const SAME_TRANSFER_MS = 10 * MINUTE_MS;
/** How far a stated transfer may be from the one the book holds. */
export const STATED_TRANSFER_MS = 2 * DAY_MS;
/** How many days apart a recorded payout and its journal entry may be (exact amount). */
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

/** Whether the corporation's journal entry `held` and the member's own `made` are one transfer. */
export function isSameJournalTransfer(held: Transfer, made: Transfer): boolean {
  return (
    sameSenderAndAmount(held, made) &&
    Math.abs(Date.parse(held.at) - Date.parse(made.at)) <= SAME_TRANSFER_MS
  );
}

/** Whether a transfer a person states is one the book holds (`held`). */
export function matchesStatedTransfer(stated: Transfer, held: Transfer): boolean {
  return (
    sameSenderAndAmount(stated, held) &&
    Math.abs(Date.parse(stated.at) - Date.parse(held.at)) <= STATED_TRANSFER_MS
  );
}
