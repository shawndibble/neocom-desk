/**
 * A moon owner's payee changed (#4653, spec #4504): either side's officers may set it, and the
 * other side hears about it, in-app and by a very short mail. Pure. The mail says who gets paid
 * now, for whom, who changed it and when; never a rate, the margin or any timing rule.
 */
import { markupText as text, serializeEveMarkup } from '../mail/eveMarkup';
import type { Payee } from './payouts';

export type PayeeSide = 'accounting' | 'moon-owner';

export interface PayeeSetBy {
  side: PayeeSide;
  /** When (ms). */
  at: number;
}

export interface PayeeChangeNotice {
  payee: Payee;
  by: PayeeSide;
  /** UTC day of the change. */
  date: string;
  at: number;
}

/**
 * The notice a viewer on `viewer`'s side sees: a change the other side made. Its own side's
 * change, or one from before the setter was kept, shows none.
 */
export function payeeChangeNotice(input: {
  payee?: Payee | null | undefined;
  payeeSetBy?: PayeeSetBy | null | undefined;
  viewer: PayeeSide;
}): PayeeChangeNotice | undefined {
  const { payee, payeeSetBy } = input;
  if (!payee || !payeeSetBy || payeeSetBy.side === input.viewer) return undefined;
  return {
    payee,
    by: payeeSetBy.side,
    date: new Date(payeeSetBy.at).toISOString().slice(0, 10),
    at: payeeSetBy.at,
  };
}

export interface PayeeChangeMail {
  subject: string;
  body: string;
}

export function composePayeeChangeMail(input: {
  recipientName: string;
  /** The corporation whose officer changed it. */
  changedByName: string;
  moonOwnerName: string;
  payeeName: string;
  /** UTC day. */
  date: string;
}): PayeeChangeMail {
  const line = `Hi ${input.recipientName}, moon mining payments for ${input.moonOwnerName} now go to ${input.payeeName}. ${input.changedByName} changed this on ${input.date}.`;
  return {
    subject: `Moon mining payments now go to ${input.payeeName}`,
    body: serializeEveMarkup([text(line)]),
  };
}
