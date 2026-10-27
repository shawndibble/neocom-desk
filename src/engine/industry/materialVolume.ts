/**
 * Pure m3 volume arithmetic for a merged materials list (issue #874) — the
 * same quantity x per-unit shape the materials table and Group Rollup
 * already merge material lines with, multiplied by the SDE's baked volume
 * instead of a hub price. No fetch/DOM/Dexie: callers inject `volumeFor`,
 * resolved against whichever type catalog they already hold.
 */

export interface MaterialVolumeLine {
  typeID: number;
  quantity: number;
}

export interface MaterialVolumeTotals {
  /** Sum of quantity x volume over every row whose volume resolved. Never NaN. */
  volume: number;
  /**
   * True when at least one row's volume could not be resolved — that row is
   * excluded from `volume` rather than treated as zero, mirroring how an
   * unpriced material's line cost is left out of a cost total instead of
   * corrupting it.
   */
  anyUnknown: boolean;
}

/** One row's volume; null when `volumeFor` cannot resolve this material. */
export function rowVolume(
  material: MaterialVolumeLine,
  volumeFor: (typeID: number) => number | null
): number | null {
  const unit = volumeFor(material.typeID);
  return unit === null ? null : material.quantity * unit;
}

/** Grand total across every row. */
export function totalVolume(
  materials: readonly MaterialVolumeLine[],
  volumeFor: (typeID: number) => number | null
): MaterialVolumeTotals {
  let volume = 0;
  let anyUnknown = false;
  for (const material of materials) {
    const line = rowVolume(material, volumeFor);
    if (line === null) anyUnknown = true;
    else volume += line;
  }
  return { volume, anyUnknown };
}
