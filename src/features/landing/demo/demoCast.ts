/**
 * The few facts the demo's always-loaded frame shares with its lazily loaded
 * board: who the pilot is, the next event, and how old each read is. Kept
 * apart from `demoData.ts` so the frame never pulls the widget stack in.
 */
import { DAY_MS, HOUR_MS, MINUTE_MS } from '@/lib/age';

export const DEMO_NAME = 'Aurelia Vex';

/** The header's Next chip, and the first row of Coming up. */
export const NEXT_EVENT = {
  title: 'Corp mining op: Badivefi belt',
  inMs: DAY_MS + 18 * HOUR_MS + 6 * MINUTE_MS,
} as const;

/** What the Data updated popover lists: one read per widget kind. Stalest first. */
export const READ_AGES: readonly { kind: string; minutes: number }[] = [
  { kind: 'training', minutes: 2 },
  { kind: 'miningTax', minutes: 2 },
  { kind: 'wallet', minutes: 1 },
  { kind: 'contracts', minutes: 1 },
  { kind: 'comingUp', minutes: 1 },
  { kind: 'orders', minutes: 1 },
  { kind: 'mail', minutes: 1 },
  { kind: 'location', minutes: 1 },
];
