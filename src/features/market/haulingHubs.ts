import { COMPARED_HUBS, DAILY_JOB_HUBS, TRADE_HUBS, type TradeHub } from '@/market/hubs';

export function haulingHubDefaults(hubId: TradeHub['id']): {
  from: TradeHub['id'];
  to: TradeHub['id'];
} {
  const from = DAILY_JOB_HUBS.some((hub) => hub.id === hubId) ? hubId : 'jita';
  return { from, to: from === 'jita' ? 'amarr' : 'jita' };
}

export const ANY_HUB = 'any';
export type HaulingHubChoice = TradeHub['id'] | typeof ANY_HUB;
export const HAULING_HUB_CHOICES: readonly HaulingHubChoice[] = [
  ...DAILY_JOB_HUBS.map((h) => h.id),
  ANY_HUB,
];

export interface HaulingLane {
  from: HaulingHubChoice;
  to: HaulingHubChoice;
}

export type HaulingEnd = TradeHub | typeof ANY_HUB;

export function haulingEnd(id: HaulingHubChoice): HaulingEnd {
  return id === ANY_HUB ? ANY_HUB : (DAILY_JOB_HUBS.find((h) => h.id === id) ?? TRADE_HUBS[0]!);
}

export function haulingEndId(end: HaulingEnd): HaulingHubChoice {
  return end === ANY_HUB ? ANY_HUB : end.id;
}

export type HaulingAnyEnd = 'from' | 'to' | null;

export function anyEndOf(lane: HaulingLane): HaulingAnyEnd {
  if (lane.from === ANY_HUB) return 'from';
  return lane.to === ANY_HUB ? 'to' : null;
}

export function hubAtAnyEnd(
  row: { fromHub: TradeHub; toHub: TradeHub },
  end: 'from' | 'to'
): TradeHub {
  return end === 'from' ? row.fromHub : row.toHub;
}

export interface HubLane {
  from: TradeHub;
  to: TradeHub;
}

export function expandHaulingLane(from: HaulingHubChoice, to: HaulingHubChoice): HubLane[] {
  const ends = (choice: HaulingHubChoice) =>
    choice === ANY_HUB ? COMPARED_HUBS : DAILY_JOB_HUBS.filter((h) => h.id === choice);
  if (from === ANY_HUB && to === ANY_HUB) return [];
  return ends(from).flatMap((f) =>
    ends(to)
      .filter((t) => t.id !== f.id)
      .map((t) => ({ from: f, to: t }))
  );
}

export function pickHaulingHub(
  lane: HaulingLane,
  end: 'from' | 'to',
  id: HaulingHubChoice
): Partial<HaulingLane> {
  const other = end === 'from' ? 'to' : 'from';
  return lane[other] === id ? { [end]: id, [other]: lane[end] } : { [end]: id };
}
