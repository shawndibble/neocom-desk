export interface MaterialVolumeLine {
  typeID: number;
  quantity: number;
}

export interface MaterialVolumeTotals {
  volume: number;
  anyUnknown: boolean;
}

export function rowVolume(
  material: MaterialVolumeLine,
  volumeFor: (typeID: number) => number | null
): number | null {
  const unit = volumeFor(material.typeID);
  return unit === null ? null : material.quantity * unit;
}

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
