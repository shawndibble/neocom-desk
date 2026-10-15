/**
 * The part of sending a reserved in-game mail that Request mail and the
 * invite-by-mail panel share: send it, then settle the slot the server holds.
 * A mail ESI refused is given back; one that may have gone out stays spent; one
 * that went out is stamped, retrying, since an unstamped one reads as unsent.
 */
import { EsiError } from '@/esi/errors';

/** Only an answer from ESI that refuses the mail proves it was not sent; a timeout or 5xx proves nothing. */
export const isDefiniteRejection = (err: unknown) =>
  err instanceof EsiError && err.status >= 400 && err.status < 500;

const CONFIRM_ATTEMPTS = 3;

/**
 * `sent`: out and stamped. `refused`: ESI said no, the slot was given back.
 * `unsure`: no answer, so it may have been delivered and the slot stays spent.
 */
export type MailSettlement = 'sent' | 'refused' | 'unsure';

export async function sendAndSettle(calls: {
  send: () => Promise<unknown>;
  release: () => Promise<unknown>;
  confirm: () => Promise<unknown>;
}): Promise<MailSettlement> {
  try {
    await calls.send();
  } catch (err) {
    if (!isDefiniteRejection(err)) return 'unsure';
    await calls.release().catch(() => undefined);
    return 'refused';
  }
  for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt += 1) {
    try {
      await calls.confirm();
      break;
    } catch {
      // Try again; the server holds the cap whether or not this lands.
    }
  }
  return 'sent';
}
