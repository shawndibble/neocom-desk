/**
 * Kind to tokens: fill and text tone, for the six clocks the Calendar merges.
 *
 * The sibling of `severityTone.ts`, and deliberately its opposite. That one
 * colours a **magnitude** — how close a deadline is, on an ordered ladder.
 * This one colours an **identity**: which part of the app a deadline came
 * from. The Calendar page paints this one; the corp ops board still paints
 * that one.
 *
 * **This is the app's first nominal palette, and it is meant to be its only
 * one.** The Mail decision refused per-folder hues partly because a first
 * nominal set would be "either reused wrongly or forked" by the next one — so
 * this lives in `components/ui/` beside the other tone maps rather than under
 * `features/character/`, and the next categorical set that genuinely needs
 * colour should extend these tokens instead of minting its own.
 *
 * **Colour is never the only signal here** (DESIGN.md §7), and it never has to
 * be: every place a hue appears, the kind is also named or drawn. The rail's
 * rows carry `KIND_ICON` and the kind's own words; the filter menu — which is
 * the only legend these six hues will ever get — carries a swatch beside each
 * label; the map's cells and the ticker's columns name their kinds in the
 * `aria-label`. That is what lets the palette stay inside the house colour
 * band instead of being stretched for colour-blind separation it does not
 * need to carry alone: the closest pair under deuteranopia is industry/orders
 * at ΔE 12, which is a weak *reinforcement* rather than a lost signal.
 */
import type { CharacterBoardItemKind } from '@/engine/character/board';

/** Background fill — flat, per DESIGN.md §6. Map dots, ticker segments, menu swatches. */
export const KIND_FILL: Record<CharacterBoardItemKind, string> = {
  calendarEvent: 'bg-kind-calendar-event',
  skillTraining: 'bg-kind-skill-training',
  industryJob: 'bg-kind-industry-job',
  planetExtraction: 'bg-kind-planet-extraction',
  contractExpiry: 'bg-kind-contract-expiry',
  orderExpiry: 'bg-kind-order-expiry',
};

/** Text tone — the rail's countdown and the glyph beside it. */
export const KIND_TEXT: Record<CharacterBoardItemKind, string> = {
  calendarEvent: 'text-kind-calendar-event',
  skillTraining: 'text-kind-skill-training',
  industryJob: 'text-kind-industry-job',
  planetExtraction: 'text-kind-planet-extraction',
  contractExpiry: 'text-kind-contract-expiry',
  orderExpiry: 'text-kind-order-expiry',
};
