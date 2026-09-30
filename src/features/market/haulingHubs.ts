/**
 * The From/To hubs Hauling Opportunities opens on when the URL names none:
 * From is the pilot's default Trade Hub (Settings > Market, `sync.marketHub`),
 * To is Jita — the deepest market to sell into — or Amarr when From already is
 * Jita, so the two never coincide. A Jita pilot sees the lane the tab always
 * opened on. The URL still wins (ADR 0015).
 */
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';

export function haulingHubDefaults(hubId: TradeHub['id']): {
  from: TradeHub['id'];
  to: TradeHub['id'];
} {
  return { from: hubId, to: hubId === 'jita' ? 'amarr' : 'jita' };
}

/**
 * One end of the lane may be _Any hub_: the scan then picks, per item, the
 * best of the five Trade Hubs for that end. Never both ends (v1: 20 lanes
 * would blow the request budget).
 */
export const ANY_HUB = 'any';
export type HaulingHubChoice = TradeHub['id'] | typeof ANY_HUB;
export const HAULING_HUB_CHOICES: readonly HaulingHubChoice[] = [
  ...TRADE_HUBS.map((h) => h.id),
  ANY_HUB,
];

export interface HaulingLane {
  from: HaulingHubChoice;
  to: HaulingHubChoice;
}

/** A lane between two real hubs. */
export interface HubLane {
  from: TradeHub;
  to: TradeHub;
}

/**
 * The hub-to-hub lanes a scan compares: the one lane, or — with one end on
 * Any — that end fanned out to every other hub. Empty for the same hub at
 * both ends, or Any at both: neither is a lane the scan will run.
 */
export function expandHaulingLane(from: HaulingHubChoice, to: HaulingHubChoice): HubLane[] {
  const ends = (choice: HaulingHubChoice) =>
    choice === ANY_HUB ? TRADE_HUBS : TRADE_HUBS.filter((h) => h.id === choice);
  if (from === ANY_HUB && to === ANY_HUB) return [];
  return ends(from).flatMap((f) =>
    ends(to)
      .filter((t) => t.id !== f.id)
      .map((t) => ({ from: f, to: t }))
  );
}

/**
 * The URL patch for picking `id` at one end of the lane. Picking the hub the
 * other end already holds swaps the two: To's default follows the pilot's
 * Trade Hub, so a From pick can otherwise land on it and leave a same-hub
 * dead end the pilot never chose. The same swap keeps Any off both ends.
 */
export function pickHaulingHub(
  lane: HaulingLane,
  end: 'from' | 'to',
  id: HaulingHubChoice
): Partial<HaulingLane> {
  const other = end === 'from' ? 'to' : 'from';
  return lane[other] === id ? { [end]: id, [other]: lane[end] } : { [end]: id };
}
