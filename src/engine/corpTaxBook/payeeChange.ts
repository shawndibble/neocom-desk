import { utcDay } from '../localDay';
import { markupText as text, serializeEveMarkup } from '../mail/eveMarkup';
import type { Payee } from './payouts';

export type PayeeSide = 'accounting' | 'moon-owner';

export interface PayeeSetBy {
  side: PayeeSide;
  at: number;
}

export interface PayeeChangeNotice {
  payee: Payee;
  by: PayeeSide;
  date: string;
  at: number;
}

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
    date: utcDay(payeeSetBy.at),
    at: payeeSetBy.at,
  };
}

export const payeeNoticeKey = (collectorCorporationId: number, feederCorporationId: number) =>
  `${collectorCorporationId}.${feederCorporationId}`;

export interface PayeeChangeMail {
  subject: string;
  body: string;
}

export function composePayeeChangeMail(input: {
  recipientName: string;
  changedByName: string;
  moonOwnerName: string;
  payeeName: string;
  date: string;
}): PayeeChangeMail {
  const line = `Hi ${input.recipientName}, moon mining payments for ${input.moonOwnerName} now go to ${input.payeeName}. ${input.changedByName} changed this on ${input.date}.`;
  return {
    subject: `Moon mining payments now go to ${input.payeeName}`,
    body: serializeEveMarkup([text(line)]),
  };
}
