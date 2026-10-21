/**
 * The two mails around removing a moon owner (issue #4520): the notice, and the short
 * one when it is cancelled. Pure; the caller supplies names and the link.
 *
 * Player-facing wording only: "moon owner" and "accounting corporation". Neither mail ever
 * names the miner rate or the margin. The notice carries a placeholder for when it takes
 * effect because the 24 hours start when the queue sends a copy to the moon owner
 * (`fillTakesEffect`); every later copy states that recorded time.
 */
import { serializeEveMarkup, type MarkupNode } from '../mail/eveMarkup';
import { REMOVAL_WAIT_MS } from './removal';

/** Where the send-time stands in a composed notice. */
export const TAKES_EFFECT_TOKEN = '{{takes-effect}}';

export interface RemovalMailInput {
  /** The accounting corporation. */
  accountingName: string;
  /** The moon owner being removed. */
  ownerName: string;
  /** The officer who started it (or cancelled it). */
  officerName: string;
  /** The payee's "Remove now" page. */
  link?: string;
}

export interface RemovalMail {
  subject: string;
  body: string;
}

const text = (t: string): MarkupNode => ({ type: 'text', text: t });
const br = (): MarkupNode => ({ type: 'br' });

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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "18 Oct 2026 14:22 EVE time" for an instant. */
export function eveTimeLabel(at: number): string {
  const d = new Date(at);
  const month = MONTHS[d.getUTCMonth()];
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()} ${hh}:${mm} EVE time`;
}

/**
 * When a copy sent at `now` says the removal takes effect: the recorded time once the clock has
 * started, else 24 hours from this send (which is what starts it).
 */
export function removalTakesEffectAt(item: { effectiveAt?: number }, now: number): number {
  return item.effectiveAt ?? now + REMOVAL_WAIT_MS;
}

/** The notice with its "takes effect" time filled in. */
export function fillTakesEffect(body: string, effectiveAt: number): string {
  return body.replaceAll(TAKES_EFFECT_TOKEN, eveTimeLabel(effectiveAt));
}
