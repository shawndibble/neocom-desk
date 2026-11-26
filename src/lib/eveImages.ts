export function characterPortraitUrl(characterId: number, size: 64 | 128 | 256 | 512): string {
  return `https://images.evetech.net/characters/${characterId}/portrait?size=${size}`;
}

export function typeIconUrl(typeId: number, size: 32 | 64 | 128): string {
  return `https://images.evetech.net/types/${typeId}/icon?size=${size}`;
}

export function typeRenderUrl(typeId: number, size: 128 | 256 | 512): string {
  return `https://images.evetech.net/types/${typeId}/render?size=${size}`;
}

export function typeBlueprintIconUrl(typeId: number, size: 32 | 64 | 128): string {
  return `https://images.evetech.net/types/${typeId}/bp?size=${size}`;
}

export function corporationLogoUrl(corporationId: number, size: 32 | 64 | 128 | 256): string {
  return `https://images.evetech.net/corporations/${corporationId}/logo?size=${size}`;
}

export function allianceLogoUrl(allianceId: number, size: 32 | 64 | 128 | 256): string {
  return `https://images.evetech.net/alliances/${allianceId}/logo?size=${size}`;
}
