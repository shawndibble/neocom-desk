import {
  markupBr as br,
  markupText as text,
  serializeEveMarkup,
  type MarkupNode,
} from '../mail/eveMarkup';
import { MONTHS } from './monthNames';
import { REMOVAL_WAIT_MS } from './removal';

export const TAKES_EFFECT_TOKEN = '{{takes-effect}}';

export interface RemovalMailInput {
  accountingName: string;
  ownerName: string;
  officerName: string;
  link?: string;
}

export interface RemovalMail {
  subject: string;
  body: string;
}

export function composeRemovalMail(input: RemovalMailInput): RemovalMail {
  const { accountingName: acct, ownerName: owner } = input;
  const nodes: MarkupNode[] = [
    text(`${input.officerName} at ${acct} started removing ${owner} as a moon owner.`),
    br(),
    br(),
    text(
      `It takes effect ${TAKES_EFFECT_TOKEN}. Mining at ${owner}'s refineries from that day on is no longer counted. ` +
        `Nothing is deleted, and what ${acct} owes ${owner} stays owed.`
    ),
    br(),
    br(),
    text(
      `To cancel it, anyone at ${acct} who manages the tax book can press Cancel removal on ${owner}'s page in Neocom Desk.`
    ),
    br(),
    text(
      `To end it now, the CEO or a Director of ${owner} can use Leave on the Moons page in Neocom Desk.`
    ),
  ];
  if (input.link) {
    nodes.push(br(), text('The payee can end it now here: '), {
      type: 'link',
      href: input.link,
      target: { kind: 'http', url: input.link },
      children: [text(input.link)],
    });
  }
  return {
    subject: `${acct}: removing ${owner} as a moon owner`,
    body: serializeEveMarkup(nodes),
  };
}

export function composeRemovalCancelledMail(input: Omit<RemovalMailInput, 'link'>): RemovalMail {
  const { accountingName: acct, ownerName: owner } = input;
  return {
    subject: `${acct}: ${owner} stays as a moon owner`,
    body: serializeEveMarkup([
      text(
        `${input.officerName} at ${acct} cancelled the removal of ${owner}. ` +
          `Nothing changes: ${owner} stays as a moon owner and nothing is removed.`
      ),
    ]),
  };
}

export function eveTimeLabel(at: number): string {
  const d = new Date(at);
  const month = MONTHS[d.getUTCMonth()];
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()} ${hh}:${mm} EVE time`;
}

export const TAKES_EFFECT_NOT_STARTED = '24 hours after the moon owner is notified';

export function removalTakesEffectAt(
  item: { effectiveAt?: number; startsClock?: boolean },
  now: number
): number | null {
  if (item.effectiveAt !== undefined) return item.effectiveAt;
  return item.startsClock === false ? null : now + REMOVAL_WAIT_MS;
}

export function fillTakesEffect(body: string, effectiveAt: number | null): string {
  return body.replaceAll(
    TAKES_EFFECT_TOKEN,
    effectiveAt === null ? TAKES_EFFECT_NOT_STARTED : eveTimeLabel(effectiveAt)
  );
}
