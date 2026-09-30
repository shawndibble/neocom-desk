/**
 * Every zKillboard URL. zKillboard is a third-party site that lists a
 * pilot's, corporation's, or alliance's kills and losses — data the ESI
 * public-info endpoints do not carry, so the Public Info Modal links out
 * to it rather than trying to show it inline.
 *
 * Shaped after `eveImages.ts`: one named helper per entity kind, so the
 * path segments live in one place instead of as template strings in JSX.
 */
import type { KillmailVictim } from '@/engine/fittings/linkLoader';
import type { RecentKill, RecentKillAttacker } from '@/engine/route/recentKills';

/**
 * A zKillboard link carries only the killmail id, but ESI's killmail endpoint
 * also wants the hash — which only zKillboard's API knows. `null` when the
 * kill isn't there or the request fails.
 */
export async function fetchKillmailHash(killmailId: number): Promise<string | null> {
  try {
    const response = await fetch(`https://zkillboard.com/api/killID/${killmailId}/`);
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const hash = Array.isArray(body) ? (body[0] as { zkb?: { hash?: unknown } })?.zkb?.hash : null;
    return typeof hash === 'string' ? hash : null;
  } catch {
    return null;
  }
}

/** How many of a hull's most recent losses Popular fits reads. */
export const HULL_LOSS_LIMIT = 40;

/**
 * One loss from zKillboard's losses API. zKillboard sends either the whole
 * killmail inline (`victim`, `killmail_time`) or only `{killmail_id, zkb}`;
 * `victim`/`time` are null in the second case, for the caller to read from
 * ESI with the hash.
 */
export interface ZkillHullLoss {
  killmailId: number;
  hash: string;
  /** zKillboard's ISK estimate of the fit (else of the whole loss); null when absent. */
  value: number | null;
  time: string | null;
  victim: KillmailVictim | null;
}

/** `ok: false` when zKillboard failed or rate-limited, so "no losses" and "couldn't load" differ. */
export type HullLossesResult = { ok: true; losses: ZkillHullLoss[] } | { ok: false; losses: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseVictim(value: unknown): KillmailVictim | null {
  if (!isRecord(value) || typeof value.ship_type_id !== 'number') return null;
  return {
    ship_type_id: value.ship_type_id,
    items: Array.isArray(value.items) ? (value.items as KillmailVictim['items']) : [],
  };
}

/** Reads a losses-API body defensively: newest `limit` entries, malformed ones dropped. */
export function parseHullLosses(body: unknown, limit = HULL_LOSS_LIMIT): ZkillHullLoss[] {
  if (!Array.isArray(body)) return [];
  const losses: ZkillHullLoss[] = [];
  for (const entry of body) {
    if (!isRecord(entry) || typeof entry.killmail_id !== 'number') continue;
    const zkb = isRecord(entry.zkb) ? entry.zkb : null;
    if (typeof zkb?.hash !== 'string') continue;
    losses.push({
      killmailId: entry.killmail_id,
      hash: zkb.hash,
      value: finiteOrNull(zkb.fittedValue) ?? finiteOrNull(zkb.totalValue),
      time: typeof entry.killmail_time === 'string' ? entry.killmail_time : null,
      victim: parseVictim(entry.victim),
    });
  }
  return losses.sort((a, b) => b.killmailId - a.killmailId).slice(0, limit);
}

/**
 * A hull's most recent losses, for Popular fits. A browser fetch with no
 * custom headers, as `fetchKillmailHash` (scope decision `20260924-195833`).
 */
export async function fetchHullLosses(shipTypeId: number): Promise<HullLossesResult> {
  try {
    const response = await fetch(`https://zkillboard.com/api/losses/shipTypeID/${shipTypeId}/`);
    if (!response.ok) return { ok: false, losses: [] };
    return { ok: true, losses: parseHullLosses(await response.json()) };
  } catch {
    return { ok: false, losses: [] };
  }
}

/** `ok: false` when zKillboard failed or rate-limited, so "no kills" and "couldn't load" differ. */
export type SystemRecentKillsResult = { ok: true; kills: RecentKill[] } | { ok: false };

function parseAttacker(value: unknown): RecentKillAttacker | null {
  if (!isRecord(value)) return null;
  const attacker: RecentKillAttacker = {};
  if (typeof value.ship_type_id === 'number') attacker.shipTypeId = value.ship_type_id;
  if (typeof value.weapon_type_id === 'number') attacker.weaponTypeId = value.weapon_type_id;
  return attacker;
}

/**
 * Reads a `kills/systemID` body defensively (issue #2329). zKillboard sends
 * the killmail inline; an entry without an id or a readable time is dropped,
 * and so is every NPC kill (`zkb.npc`) — Route Safety counts player kills.
 */
export function parseSystemKills(body: unknown): RecentKill[] {
  if (!Array.isArray(body)) return [];
  const kills: RecentKill[] = [];
  for (const entry of body) {
    if (!isRecord(entry) || typeof entry.killmail_id !== 'number') continue;
    const time = typeof entry.killmail_time === 'string' ? Date.parse(entry.killmail_time) : NaN;
    if (!Number.isFinite(time)) continue;
    const zkb = isRecord(entry.zkb) ? entry.zkb : {};
    if (zkb.npc === true) continue;
    kills.push({
      killmailId: entry.killmail_id,
      time,
      locationId: finiteOrNull(zkb.locationID),
      attackers: Array.isArray(entry.attackers)
        ? entry.attackers.flatMap((attacker) => parseAttacker(attacker) ?? [])
        : [],
    });
  }
  return kills;
}

/**
 * A solar system's player kills from the last hour, for Route Safety. A
 * browser fetch with no custom headers, as `fetchKillmailHash` (scope
 * decision `20260924-195833`).
 */
export async function fetchSystemRecentKills(systemId: number): Promise<SystemRecentKillsResult> {
  try {
    const response = await fetch(
      `https://zkillboard.com/api/kills/systemID/${systemId}/pastSeconds/3600/`
    );
    if (!response.ok) return { ok: false };
    return { ok: true, kills: parseSystemKills(await response.json()) };
  } catch {
    return { ok: false };
  }
}

export function systemZkillUrl(systemId: number): string {
  return `https://zkillboard.com/system/${systemId}/`;
}

export function characterZkillUrl(characterId: number): string {
  return `https://zkillboard.com/character/${characterId}/`;
}

export function corporationZkillUrl(corporationId: number): string {
  return `https://zkillboard.com/corporation/${corporationId}/`;
}

export function allianceZkillUrl(allianceId: number): string {
  return `https://zkillboard.com/alliance/${allianceId}/`;
}
