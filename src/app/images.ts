/** EVE image server portrait URL (CORS-safe for <img>). */
export function characterPortraitUrl(
  characterId: number,
  size: 64 | 128 | 256 | 512 = 128
): string {
  return `https://images.evetech.net/characters/${characterId}/portrait?size=${size}`;
}
