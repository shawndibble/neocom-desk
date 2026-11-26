const COPY_ONLY_BLUEPRINT_IDS: ReadonlySet<number> = new Set([53032, 53033, 53034, 33196]);

export function isCopyOnlyBlueprint(blueprintTypeID: number): boolean {
  return COPY_ONLY_BLUEPRINT_IDS.has(blueprintTypeID);
}

export const COPY_ONLY_BLUEPRINT_TYPE_IDS: readonly number[] = [...COPY_ONLY_BLUEPRINT_IDS];
