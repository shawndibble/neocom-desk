/**
 * The Statement mail's text (D16 as narrowed by Shawn's mockup review, issue
 * #4064; docs/context/decisions/20261018-161107-…-statement-mail-stays-simple.md).
 * Per line only date, location (refinery), mined value and tax; then the total,
 * the amount due with its due date, the pay code and the verify link. The
 * verify link carries pricing, terms and payments credited, so none of that is
 * mailed. Pure: names and the link arrive from the caller.
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

function rowsAt(input: StatementMailInput, level: MailDetailLevel): Row[] {
  const where = (line: StatementMailInput['lines'][number]) =>
    line.structureId === undefined
      ? (line.reason ?? '—')
      : (input.refineryName(line.structureId) ?? `Structure ${line.structureId}`);
  const raw: Row[] = input.lines.map((line) => ({
    date: line.date,
    where: where(line),
    value: line.estimatedValue,
    tax: line.tax,
  }));
  if (level === 'lines') return raw;
  const merged = new Map<string, Row>();
  const dates = raw.map((r) => r.date).sort();
  const span = dates.length > 0 ? `${dates[0]} – ${dates[dates.length - 1]}` : '';
  for (const row of raw) {
    const date = level === 'byDay' ? row.date : span;
    const key = `${date}|${row.where}`;
    const existing = merged.get(key);
    if (existing) {
      existing.value += row.value;
      existing.tax += row.tax;
    } else merged.set(key, { ...row, date });
  }
  return [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
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
    text(
      `Donate to ${input.corporationName}; any of your characters counts. Code ${input.code} pins it to this Statement.`
    ),
    br(),
    text("The link has every line's pricing, terms and payments: "),
    {
      type: 'link',
      href: input.verifyUrl,
      target: { kind: 'http', url: input.verifyUrl },
      children: [text(input.verifyUrl)],
    }
  );
  return {
    subject: `${reminder ? 'Reminder: ' : ''}${input.corporationName} moon tax Statement, ${input.periodLabel}`,
    body: serializeEveMarkup(nodes),
    detail,
  };
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
  for (const detail of ['lines', 'byDay', 'byRefinery'] as const) {
    const mail = build(input, detail);
    if (mail.body.length <= EVE_MARKUP_LIMIT) return mail;
  }
  return build(input, 'byRefinery');
}
