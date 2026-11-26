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
  code: string;
  accounts?: readonly string[];
  amountDue: number;
  days: readonly NoticeMailDay[];
  oldest: string;
  verifyUrl: string;
}

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

export function verifyUrl(origin: string, token: string): string {
  return `${origin}/corp-tax-book/verify/${token}`;
}

export const PREVIEW_VERIFY_TOKEN = '…';

export const previewVerifyUrl = (origin: string): string => verifyUrl(origin, PREVIEW_VERIFY_TOKEN);

export function fillVerifyLink(body: string, origin: string, url: string): string {
  const preview = previewVerifyUrl(origin);
  return body.replaceAll(preview, url).replaceAll(encodeURI(preview), url);
}

export function editedMailLength(body: string, origin: string): number {
  return fillVerifyLink(body, origin, verifyUrl(origin, 'x'.repeat(VERIFY_TOKEN_LENGTH))).length;
}

export type EditedMailProblem = 'empty' | 'subjectTooLong' | 'bodyTooLong' | 'noLink';

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

export const editedMailBlocked = (problems: readonly EditedMailProblem[]): boolean =>
  problems.some((p) => p !== 'noLink');

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
