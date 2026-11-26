export const UPWELL_STRUCTURE_ID_FLOOR = 1_000_000_000_000;

export function isStargateId(id: number): boolean {
  return id >= 50_000_000 && id < 60_000_000;
}

export function isNpcStationId(id: number): boolean {
  return id >= 60_000_000 && id < 70_000_000;
}
