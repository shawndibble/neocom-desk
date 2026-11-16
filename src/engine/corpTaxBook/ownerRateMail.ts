/**
 * The short mail a moon owner's CEO and payee get when the accounting
 * corporation changes its rate (#4515, spec #4504). Pure. It carries the new
 * rate, the date and what they asked for, and nothing else: never the miner
 * rate or the margin, and no dev terms.
 */
import { markupText as text, serializeEveMarkup, type MarkupNode } from '../mail/eveMarkup';
import { rateNotice, type OwnerRateChange } from './ownerRate';
import type { Payee } from './payouts';

export interface RateChangeMail {
  subject: string;
  body: string;
}

const pctText = (pct: number) => `${Math.round(pct * 100) / 100}%`;

export function composeRateChangeMail(input: {
  /** The accounting corporation that set the rate. */
  accountingCorporationName: string;
  recipientName: string;
  change: OwnerRateChange;
}): RateChangeMail {
  const notice = rateNotice(input.change);
  const lines = [
    `Hi ${input.recipientName}, ${input.accountingCorporationName} set your moon mining rate to ${pctText(notice.pct)} from ${notice.date}.`,
  ];
  if (notice.askedPct !== undefined) lines.push(`You asked for ${pctText(notice.askedPct)}.`);
  const nodes: MarkupNode[] = [text(lines.join(' '))];
  return {
    subject: `Your moon mining rate is now ${pctText(notice.pct)}`,
    body: serializeEveMarkup(nodes),
  };
}

/**
 * The short mail a moon owner's CEO and payee get when the accounting corporation turns settled
 * otherwise on or off (#6209). It says from which day, and that what was owed before stays owed.
 */
export function composeModeChangeMail(input: {
  accountingCorporationName: string;
  recipientName: string;
  mode: 'normal' | 'settled-otherwise';
  /** The UTC day the switch takes effect. */
  date: string;
}): RateChangeMail {
  const { accountingCorporationName: by, recipientName: to, date } = input;
  const settled = input.mode === 'settled-otherwise';
  const line = settled
    ? `Hi ${to}, ${by} settles your moon mining another way from ${date}: nothing more builds up in ISK from then. What was owed to you before then stays owed until it is paid.`
    : `Hi ${to}. From ${date}, ${by} pays your moon mining in ISK again, at your rate.`;
  return {
    subject: settled
      ? 'Your moon mining is now settled another way'
      : 'Your moon mining is paid in ISK again',
    body: serializeEveMarkup([text(line)]),
  };
}

/**
 * The mail both sides get when the accounting corporation can no longer read the moon owner's
 * mining ledger (#6210): since when, and that EVE drops unread mining after 30 days, so a
 * reconnect before `lostOn` still counts all of it.
 */
export function composeGrantStaleMail(input: {
  accountingCorporationName: string;
  moonOwnerName: string;
  recipientName: string;
  /** The UTC day the ledger was first refused. */
  staleSince: string;
  /** The UTC day EVE drops the first unread day (`oreLostOn`). */
  lostOn: string;
}): RateChangeMail {
  const { accountingCorporationName: by, moonOwnerName: owner, recipientName: to } = input;
  const line =
    `Hi ${to}, ${by} cannot read the moon mining ledger of ${owner} since ${input.staleSince}: ` +
    `the character who gave access lost the Accountant role or revoked it. Mining since then is ` +
    `not counted until it is reconnected (an Accountant of ${owner}, on its moon owner page). ` +
    `EVE keeps the ledger for 30 days: reconnect before ${input.lostOn} and none of it is lost.`;
  return {
    subject: `${owner}'s moon mining ledger can't be read`,
    body: serializeEveMarkup([text(line)]),
  };
}

/**
 * Who is mailed about a moon owner: its CEO and its payee, once each. A payee
 * that is a corporation reaches that corporation's CEO. Unknown ids drop out.
 */
export function moonOwnerMailRecipients(input: {
  ceoId: number | null;
  payee?: Payee;
  /** The payee corporation's CEO, when the payee is a corporation. */
  payeeCeoId?: number | null;
}): number[] {
  const payeeId = input.payee?.kind === 'character' ? input.payee.id : (input.payeeCeoId ?? null);
  return [...new Set([input.ceoId, payeeId].filter((id): id is number => typeof id === 'number'))];
}
