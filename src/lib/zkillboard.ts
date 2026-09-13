/**
 * Every zKillboard URL. zKillboard is a third-party site that lists a
 * pilot's, corporation's, or alliance's kills and losses — data the ESI
 * public-info endpoints do not carry, so the Public Info Modal links out
 * to it rather than trying to show it inline.
 *
 * Shaped after `eveImages.ts`: one named helper per entity kind, so the
 * path segments live in one place instead of as template strings in JSX.
 */

export function characterZkillUrl(characterId: number): string {
  return `https://zkillboard.com/character/${characterId}/`;
}

export function corporationZkillUrl(corporationId: number): string {
  return `https://zkillboard.com/corporation/${corporationId}/`;
}

export function allianceZkillUrl(allianceId: number): string {
  return `https://zkillboard.com/alliance/${allianceId}/`;
}
