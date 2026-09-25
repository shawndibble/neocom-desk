/**
 * Every zKillboard URL. zKillboard is a third-party site that lists a
 * pilot's, corporation's, or alliance's kills and losses — data the ESI
 * public-info endpoints do not carry, so the Public Info Modal links out
 * to it rather than trying to show it inline.
 *
 * Shaped after `eveImages.ts`: one named helper per entity kind, so the
 * path segments live in one place instead of as template strings in JSX.
 */

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

export function characterZkillUrl(characterId: number): string {
  return `https://zkillboard.com/character/${characterId}/`;
}

export function corporationZkillUrl(corporationId: number): string {
  return `https://zkillboard.com/corporation/${corporationId}/`;
}

export function allianceZkillUrl(allianceId: number): string {
  return `https://zkillboard.com/alliance/${allianceId}/`;
}
