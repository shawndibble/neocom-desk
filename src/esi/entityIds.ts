export function isNpcCharacterId(id: number): boolean {
  return id >= 3_000_000 && id < 4_000_000;
}

export function isNpcCorporationId(id: number): boolean {
  return id >= 1_000_000 && id < 2_000_000;
}
