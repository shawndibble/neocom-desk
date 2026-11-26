export function stationPriceKey(stationId: number, typeId: number): string {
  return `${stationId}:${typeId}`;
}
