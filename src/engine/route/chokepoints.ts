export const GANK_CHOKEPOINTS: ReadonlyMap<number, string> = new Map([
  [30002768, 'Uedama'],
  [30002765, 'Sivala'],
  [30002641, 'Aufay'],
  [30002634, 'Balle'],

  [30002813, 'Tama'],
  [30002718, 'Rancer'],
  [30005196, 'Ahbazon'],
]);

export function isGankChokepoint(systemId: number | null): boolean {
  return systemId !== null && GANK_CHOKEPOINTS.has(systemId);
}

export function chokepointsOnRoute(systemIds: readonly number[]): string[] {
  const names: string[] = [];
  for (const systemId of systemIds) {
    const name = GANK_CHOKEPOINTS.get(systemId);
    if (name !== undefined) names.push(name);
  }
  return names;
}
