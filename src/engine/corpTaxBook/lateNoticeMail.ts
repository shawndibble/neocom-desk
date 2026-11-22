/**
 * A late notice's mail (#6294; the mail stays simple, decision 20261018-161107): every day still
 * owed, oldest first, with where it was mined and what is left of it; the total owed now; the
 * Miner's Reason code; the verify link, which carries pricing, terms and payments, so none of
 * that is mailed. Pure: names and the link arrive from the caller.
 */
import {
  EVE_MARKUP_LIMIT,
  markupBr as br,
  markupPlainText,
  markupText as text,
  parseEveMarkup,
  serializeEveMarkup,
  type MarkupNode,
} from '../mail/eveMarkup';
import { MAX_SUBJECT_LENGTH } from '../mail/mailCompose';
import { formatIsk } from '../../lib/isk';
import type { MailKind } from './mailQueue';
import { VERIFY_TOKEN_LENGTH } from './verifyToken';

export interface LateNoticeMailInput {
  kind: MailKind;
  corporationName: string;
  recipientName: string;
  /** The Miner's Reason code (`minerPaymentCode`): a donation carrying it is theirs. */
  code: string;
  /**
   * The Accounts (wallet divisions) the book reads donations from, as EVE's transfer window names
   * them: a donation into another one is never credited (#6204).
   */
  accounts?: readonly string[];
  /** Everything the Miner owes now. */
  amountDue: number;
  /** Every unpaid day, in any order: the mail lists them oldest first. */
  days: readonly NoticeMailDay[];
  /** The oldest unpaid day. */
  oldest: string;
  verifyUrl: string;
}

/** One day a late notice lists: where it was mined (the moon, else the refinery) and what is owed. */
export interface NoticeMailDay {
  date: string;
  place: string;
  tax: number;
}

export type MailDetailLevel = 'lines' | 'byDay' | 'byRefinery';

export interface LateNoticeMail {
  subject: string;
  body: string;
  detail: MailDetailLevel;
}

interface Row {
  date: string;
  where: string;
  tax: number;
}

const bold = (t: string): MarkupNode => ({ type: 'b', children: [text(t)] });

/**
 * A notice's days at a detail level, oldest first: each day and place, each day (no place), or
 * each place over the whole span.
 */
function rowsAt(days: readonly NoticeMailDay[], level: MailDetailLevel): Row[] {
  const raw = [...days]
    .sort((a, b) => a.date.localeCompare(b.date) || a.place.localeCompare(b.place))
    .map((d) => ({ date: d.date, where: d.place, tax: d.tax }));
  if (level === 'lines') return raw;
  const merged = new Map<string, Row>();
  const span = raw.length > 0 ? `${raw[0]!.date} – ${raw.at(-1)!.date}` : '';
  for (const row of raw) {
    const date = level === 'byDay' ? row.date : span;
    const where = level === 'byDay' ? '' : row.where;
    const key = `${date}|${where}`;
    const existing = merged.get(key);
    if (existing) existing.tax += row.tax;
    else merged.set(key, { ...row, date, where });
  }
  return [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function linkNode(url: string): MarkupNode {
  return { type: 'link', href: url, target: { kind: 'http', url }, children: [text(url)] };
}

function build(input: LateNoticeMailInput, detail: MailDetailLevel): LateNoticeMail {
  const rows = rowsAt(input.days, detail);
  const reminder = input.kind === 'reminder';
  const dayCount = new Set(input.days.map((d) => d.date)).size;
  const nodes: MarkupNode[] = [
    text(
      `Hi ${input.recipientName}, your ${input.corporationName} moon tax is behind. ` +
        `You owe ${formatIsk(input.amountDue)} ISK for ${dayCount} ${dayCount === 1 ? 'day' : 'days'}, the oldest ${input.oldest}.`
    ),
    br(),
    br(),
    bold(detail === 'byDay' ? 'Date · Tax still owed' : 'Date · Moon · Tax still owed'),
    br(),
    ...rows.flatMap((r) => [
      text(
        r.where ? `${r.date} · ${r.where} · ${formatIsk(r.tax)}` : `${r.date} · ${formatIsk(r.tax)}`
      ),
      br(),
    ]),
    bold(`Total owed now: ${formatIsk(input.amountDue)} ISK`),
    br(),
  ];
  if (detail !== 'lines') {
    nodes.push(text('Days are summarised to fit a mail; the link below has every one.'), br());
  }
  nodes.push(
    br(),
    text(
      `Donate to ${input.corporationName}` +
        (input.accounts?.length ? ` (Account: ${input.accounts.join(' or ')})` : '') +
        `; any of your characters counts, and put ${input.code} in the reason. A payment pays your oldest day first.`
    ),
    br(),
    text('The link has the live total, every day and your payments: '),
    linkNode(input.verifyUrl)
  );
  return {
    subject: `${reminder ? 'Reminder: ' : ''}${input.corporationName} moon tax: late notice`,
    body: serializeEveMarkup(nodes),
    detail,
  };
}

/** A late notice's verify page, where a mail's link takes the Miner. */
export function verifyUrl(origin: string, token: string): string {
  return `${origin}/corp-tax-book/verify/${token}`;
}

/**
 * The token a preview's verify link carries before the late notice is issued and its real link
 * exists: "Preview mail" shows `…/verify/…`.
 */
export const PREVIEW_VERIFY_TOKEN = '…';

/** The verify link a preview shows in place of the real one. */
export const previewVerifyUrl = (origin: string): string => verifyUrl(origin, PREVIEW_VERIFY_TOKEN);

/**
 * A mail the officer edited in its preview, with the preview's verify link swapped for the real
 * one: the href and the link text alike, and the percent-encoded form an editor may write.
 */
export function fillVerifyLink(body: string, origin: string, url: string): string {
  const preview = previewVerifyUrl(origin);
  return body.replaceAll(preview, url).replaceAll(encodeURI(preview), url);
}

/** An edited body's length as it will be sent, once its preview link becomes the real one. */
export function editedMailLength(body: string, origin: string): number {
  return fillVerifyLink(body, origin, verifyUrl(origin, 'x'.repeat(VERIFY_TOKEN_LENGTH))).length;
}

/**
 * What stops an edited mail going out (`empty`, `subjectTooLong`, `bodyTooLong`), and the one
 * thing only warned about: the verify link was taken out (`noLink`).
 */
export type EditedMailProblem = 'empty' | 'subjectTooLong' | 'bodyTooLong' | 'noLink';

/** The officer's edit of a preview, checked against EVE's limits with the real link counted. */
export function checkEditedMail(
  edit: { subject: string; body: string },
  origin: string
): EditedMailProblem[] {
  const problems: EditedMailProblem[] = [];
  const message = markupPlainText(parseEveMarkup(edit.body)).trim();
  if (edit.subject.trim() === '' || message === '') problems.push('empty');
  if (edit.subject.length > MAX_SUBJECT_LENGTH) problems.push('subjectTooLong');
  if (editedMailLength(edit.body, origin) > EVE_MARKUP_LIMIT) problems.push('bodyTooLong');
  if (fillVerifyLink(edit.body, origin, '') === edit.body) problems.push('noLink');
  return problems;
}

/** Whether the problems keep Save off: all but a missing link do. */
export const editedMailBlocked = (problems: readonly EditedMailProblem[]): boolean =>
  problems.some((p) => p !== 'noLink');

/**
 * The mail, with every day and place when it fits; past the 10,000-character cap one line per
 * day, then one per place for the whole span. The total, code and link are never cut.
 */
export function composeLateNoticeMail(input: LateNoticeMailInput): LateNoticeMail {
  if (input.corporationName.trim() === '') {
    throw new Error('composeLateNoticeMail needs the corporation name; it was empty');
  }
  for (const detail of ['lines', 'byDay', 'byRefinery'] as const) {
    const mail = build(input, detail);
    if (mail.body.length <= EVE_MARKUP_LIMIT) return mail;
  }
  return build(input, 'byRefinery');
}
