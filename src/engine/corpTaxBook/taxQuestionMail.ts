import { formatIsk } from '../../lib/isk';
import { mailSafe } from '../../lib/mailSafe';
import { clipToCodePoints, MAX_MAIL_SUBJECT } from '../communities/requestMail';
import {
  EVE_MARKUP_LIMIT,
  markupBr as br,
  markupText as text,
  serializeEveMarkup,
  type MarkupNode,
} from '../mail/eveMarkup';

export interface TaxQuestionMailInput {
  kind: 'paid' | 'notOwed' | 'notPaying';
  memberName: string;
  corpName: string;
  days: string;
  amountIsk: number;
  note: string;
  transfers?: { amountIsk: number; at: string; journalRef: number }[];
}

export interface TaxQuestionMail {
  subject: string;
  body: string;
}

const NOTE_MAX = 1000;
const NAME_MAX = 60;
const TRANSFERS_MAX = 10;

const bold = (t: string): MarkupNode => ({ type: 'b', children: [text(t)] });
const clean = (value: string, max: number) => clipToCodePoints(mailSafe(value).trim(), max);

export function composeTaxQuestionMail(input: TaxQuestionMailInput): TaxQuestionMail {
  const member = clean(input.memberName, NAME_MAX);
  const corp = clean(input.corpName, NAME_MAX);
  const days = clean(input.days, 60);
  const amount = `${formatIsk(input.amountIsk)} ISK`;

  const says = {
    paid: `says they paid ${amount} of moon mining tax for ${days}.`,
    notOwed: `says they do not owe ${amount} of moon mining tax for ${days}.`,
    notPaying: `says they will not pay ${amount} of moon mining tax for ${days}.`,
  }[input.kind];
  const subject = {
    paid: `${member} says they paid their ${corp} mining tax`,
    notOwed: `${member} disputes their ${corp} mining tax`,
    notPaying: `${member} will not pay their ${corp} mining tax`,
  }[input.kind];

  const nodes: MarkupNode[] = [bold(`${member} ${says}`), br()];
  const transfers = input.kind === 'paid' ? (input.transfers ?? []) : [];
  if (transfers.length > 0) {
    nodes.push(br(), text('Transfers they sent:'), br());
    for (const t of transfers.slice(0, TRANSFERS_MAX)) {
      nodes.push(
        text(`${formatIsk(t.amountIsk)} ISK on ${clean(t.at, 40)} (journal ref ${t.journalRef})`),
        br()
      );
    }
    if (transfers.length > TRANSFERS_MAX) {
      nodes.push(text(`and ${transfers.length - TRANSFERS_MAX} more.`), br());
    }
  }
  const note = clean(input.note, NOTE_MAX);
  if (note) nodes.push(br(), text(`They wrote: ${note}`), br());
  nodes.push(
    br(),
    text(
      `The question is waiting in ${corp}'s Needs you queue in Neocom Desk, where an officer can answer it.`
    )
  );

  const body = serializeEveMarkup(nodes);
  return {
    subject: clipToCodePoints(mailSafe(subject), MAX_MAIL_SUBJECT),
    body: body.length <= EVE_MARKUP_LIMIT ? body : clipToCodePoints(body, EVE_MARKUP_LIMIT),
  };
}
