/**
 * Every images.evetech.net URL. `size` is required rather than defaulted — a
 * default is what let three earlier near-copies of these helpers diverge
 * silently. CORS-safe for `<img>`; the image server needs no auth.
 */

export function characterPortraitUrl(characterId: number, size: 64 | 128 | 256 | 512): string {
  return `https://images.evetech.net/characters/${characterId}/portrait?size=${size}`;
}

export function typeIconUrl(typeId: number, size: 32 | 64 | 128): string {
  return `https://images.evetech.net/types/${typeId}/icon?size=${size}`;
}

/**
 * Blueprints and reaction formulas have no `icon` render on the image
 * server (it 400s) — only this one, under their own type ID. `TypeIcon`
 * falls back to it when `typeIconUrl` fails to load.
 */
export function typeBlueprintIconUrl(typeId: number, size: 32 | 64 | 128): string {
  return `https://images.evetech.net/types/${typeId}/bp?size=${size}`;
}

export function corporationLogoUrl(corporationId: number, size: 32 | 64 | 128 | 256): string {
  return `https://images.evetech.net/corporations/${corporationId}/logo?size=${size}`;
}

export function allianceLogoUrl(allianceId: number, size: 32 | 64 | 128 | 256): string {
  return `https://images.evetech.net/alliances/${allianceId}/logo?size=${size}`;
}
