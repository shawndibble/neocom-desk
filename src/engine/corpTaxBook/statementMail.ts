/**
 * The Statement mail's text (D16 as narrowed by Shawn's mockup review, issue
 * #4064; docs/context/decisions/20261018-161107-…-statement-mail-stays-simple.md).
 * Per line only date, location (refinery), mined value and tax; then the total,
 * the amount due with its due date, the pay code and the verify link. The
 * verify link carries pricing, terms and payments credited, so none of that is
 * mailed. Pure: names and the link arrive from the caller. A late notice (#6294) lists every
 * day still owed instead, with the total owed now, the code and the same link.
 */
import {
  EVE_MARKUP_LIMIT,
  markupBr as br,
  markupText as text,
  serializeEveMarkup,
  type MarkupNode,
} from '../mail/eveMarkup';
import { formatIsk } from '../../lib/isk';
import type { MailKind } from './mailQueue';
import type { StatementLine } from './statements';

export interface StatementMailInput {
  kind: MailKind;
  corporationName: string;
  recipientName: string;
  /** E.g. "Sep 2026". */
  periodLabel: string;
  /** The payment code that pins a donation to this Statement (D15). */
  code: string;
  /**
   * The Accounts (wallet divisions) the book reads donations from, as EVE's transfer window names
   * them: a donation into another one is never credited (#6204).
   */
  accounts?: readonly string[];
  lines: readonly Pick<
    StatementLine,
    'kind' | 'date' | 'structureId' | 'estimatedValue' | 'tax' | 'reason'
  >[];
  /** Resolves a refinery's name; an unknown id reads as its number. */
  refineryName: (structureId: number) => string | undefined;
  /** The Miner's balance due: this Statement plus anything carried, less credit. */
  amountDue: number;
  /** Still owed from earlier Statements, included in `amountDue`. */
  carried: number;
  /** ISO date the balance is due by. */
  dueDate: string;
  verifyUrl: string;
  /**
   * A late notice on a running account (#6294): the mail lists every day still owed instead of
   * the lines, and `amountDue` is everything owed now. Absent on a calendar Statement.
   */
  notice?: NoticeMail;
}

/** One day a late notice lists: where it was mined (the moon, else the refinery) and what is owed. */
export interface NoticeMailDay {
  date: string;
  place: string;
  tax: number;
}

export interface NoticeMail {
  /** Every unpaid day, in any order: the mail lists them oldest first. */
  days: readonly NoticeMailDay[];
  /** The oldest unpaid day. */
  oldest: string;
}

export type MailDetailLevel = 'lines' | 'byDay' | 'byRefinery';

export interface StatementMail {
  subject: string;
  body: string;
  detail: MailDetailLevel;
}

interface Row {
  date: string;
  where: string;
  value: number;
  tax: number;
}

const bold = (t: string): MarkupNode => ({ type: 'b', children: [text(t)] });

/**
 * Rows at a detail level: as given, merged per date and place, or merged per place over the
 * whole span. `dropPlaceByDay` blanks the place when merging per day (a notice's by-day list).
 */
function mergeRows(raw: Row[], level: MailDetailLevel, dropPlaceByDay = false): Row[] {
  if (level === 'lines') return raw;
  const merged = new Map<string, Row>();
  const dates = raw.map((r) => r.date).sort();
  const span = dates.length > 0 ? `${dates[0]} – ${dates[dates.length - 1]}` : '';
  for (const row of raw) {
    const date = level === 'byDay' ? row.date : span;
    const where = level === 'byDay' && dropPlaceByDay ? '' : row.where;
    const key = `${date}|${where}`;
    const existing = merged.get(key);
    if (existing) {
      existing.value += row.value;
      existing.tax += row.tax;
    } else merged.set(key, { ...row, date, where });
  }
  return [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function rowsAt(input: StatementMailInput, level: MailDetailLevel): Row[] {
  const where = (line: StatementMailInput['lines'][number]) =>
    line.structureId === undefined
      ? (line.reason ?? '—')
      : (input.refineryName(line.structureId) ?? `Structure ${line.structureId}`);
  return mergeRows(
    input.lines.map((line) => ({
      date: line.date,
      where: where(line),
      value: line.estimatedValue,
      tax: line.tax,
    })),
    level
  );
}

/** The donate paragraph both mails share; `tail` is what differs after the any-character clause. */
function donateNode(input: StatementMailInput, tail: string): MarkupNode {
  return text(
    `Donate to ${input.corporationName}` +
      (input.accounts?.length ? ` (Account: ${input.accounts.join(' or ')})` : '') +
      `; any of your characters counts${tail}`
  );
}

function linkNode(url: string): MarkupNode {
  return { type: 'link', href: url, target: { kind: 'http', url }, children: [text(url)] };
}

function build(input: StatementMailInput, detail: MailDetailLevel): StatementMail {
  const rows = rowsAt(input, detail);
  const total = rows.reduce((sum, r) => sum + r.tax, 0);
  const reminder = input.kind === 'reminder';
  const nodes: MarkupNode[] = [
    text(
      reminder
        ? `Hi ${input.recipientName}, a reminder of your ${input.corporationName} moon tax Statement for ${input.periodLabel}.`
        : `Hi ${input.recipientName}, here is your ${input.corporationName} moon tax Statement for ${input.periodLabel}.`
    ),
    br(),
    br(),
    bold('Date · Refinery · Mined value · Tax'),
    br(),
    ...rows.flatMap((r) => [
      text(`${r.date} · ${r.where} · ${formatIsk(r.value)} · ${formatIsk(r.tax)}`),
      br(),
    ]),
    bold(`Total tax: ${formatIsk(total)} ISK`),
    br(),
  ];
  if (detail !== 'lines') {
    nodes.push(text('Lines are summarised to fit a mail; the link below has every one.'), br());
  }
  nodes.push(
    br(),
    bold(
      `Amount due ${formatIsk(input.amountDue)} ISK by ${input.dueDate}` +
        (input.carried > 0 ? ` (includes ${formatIsk(input.carried)} still owed).` : '.')
    ),
    br(),
    donateNode(input, `. Code ${input.code} pins it to this Statement.`),
    br(),
    text("The link has every line's pricing, terms and payments: "),
    linkNode(input.verifyUrl)
  );
  return {
    subject: `${reminder ? 'Reminder: ' : ''}${input.corporationName} moon tax Statement, ${input.periodLabel}`,
    body: serializeEveMarkup(nodes),
    detail,
  };
}

/** A notice's days at a detail level, oldest first: each day and place, each day, or each place. */
function noticeRows(days: readonly NoticeMailDay[], level: MailDetailLevel): Row[] {
  const sorted = [...days].sort(
    (a, b) => a.date.localeCompare(b.date) || a.place.localeCompare(b.place)
  );
  return mergeRows(
    sorted.map((d) => ({ date: d.date, where: d.place, value: 0, tax: d.tax })),
    level,
    true
  );
}

function buildNotice(input: StatementMailInput, notice: NoticeMail, detail: MailDetailLevel) {
  const rows = noticeRows(notice.days, detail);
  const reminder = input.kind === 'reminder';
  const dayCount = new Set(notice.days.map((d) => d.date)).size;
  const nodes: MarkupNode[] = [
    text(
      `Hi ${input.recipientName}, your ${input.corporationName} moon tax is behind. ` +
        `You owe ${formatIsk(input.amountDue)} ISK for ${dayCount} ${dayCount === 1 ? 'day' : 'days'}, the oldest ${notice.oldest}.`
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
    donateNode(
      input,
      `, and put ${input.code} in the reason. A payment pays your oldest day first.`
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

/**
 * The token a preview's verify link carries before the Statement is issued and its real link
 * exists: "Preview mail" shows `…/verify/…`.
 */
export const PREVIEW_VERIFY_TOKEN = '…';

/**
 * A mail the officer edited in its preview, with the preview's verify link swapped for the real
 * one: the href and the link text alike, and the percent-encoded form an editor may write.
 */
export function fillVerifyLink(body: string, previewUrl: string, url: string): string {
  return body.replaceAll(previewUrl, url).replaceAll(encodeURI(previewUrl), url);
}

/** A verify token's length: 32 random bytes as base64url (`functions/src/corpTaxBookStore.ts`). */
const VERIFY_TOKEN_LENGTH = 43;

/** An edited body's length as it will be sent, once its preview link becomes the real one. */
export function editedMailLength(body: string, previewUrl: string): number {
  const real = previewUrl.slice(0, -PREVIEW_VERIFY_TOKEN.length) + 'x'.repeat(VERIFY_TOKEN_LENGTH);
  return fillVerifyLink(body, previewUrl, real).length;
}

/**
 * The mail, with every line when it fits; past the 10,000-character cap one
 * line per day per refinery, then one per refinery for the period. The total,
 * amount due, code and link are never cut.
 */
export function composeStatementMail(input: StatementMailInput): StatementMail {
  if (input.corporationName.trim() === '') {
    throw new Error('composeStatementMail needs the corporation name; it was empty');
  }
  const { notice } = input;
  const compose = (detail: MailDetailLevel) =>
    notice ? buildNotice(input, notice, detail) : build(input, detail);
  for (const detail of ['lines', 'byDay', 'byRefinery'] as const) {
    const mail = compose(detail);
    if (mail.body.length <= EVE_MARKUP_LIMIT) return mail;
  }
  return compose('byRefinery');
}
