/** EVE image server type icon URL (CORS-safe for <img>), mirroring `src/app/images.ts`'s portrait helper. */
export function typeIconUrl(typeId: number, size: 32 | 64 = 32): string {
  return `https://images.evetech.net/types/${typeId}/icon?size=${size}`;
}
