/**
 * Every images.evetech.net URL. One module, because these were previously
 * three near-copies that had already drifted: two `typeIconUrl`s disagreed on
 * their default size, so the same call rendered differently depending on
 * which one the caller happened to import.
 *
 * `size` is therefore required — a default is what let them diverge silently.
 * CORS-safe for `<img>`; the image server needs no auth.
 */

export function characterPortraitUrl(characterId: number, size: 64 | 128 | 256 | 512): string {
  return `https://images.evetech.net/characters/${characterId}/portrait?size=${size}`;
}

export function typeIconUrl(typeId: number, size: 32 | 64 | 128): string {
  return `https://images.evetech.net/types/${typeId}/icon?size=${size}`;
}
