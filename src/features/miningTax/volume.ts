export interface VolumeSum {
  m3: number;
  missingTypeIds: number[];
}

export function sumVolume<T>(
  lines: readonly T[],
  typeId: (line: T) => number,
  quantity: (line: T) => number,
  typeVolumes: ReadonlyMap<number, number>
): VolumeSum {
  let m3 = 0;
  const missingTypeIds: number[] = [];
  for (const line of lines) {
    const id = typeId(line);
    const unit = typeVolumes.get(id);
    if (unit === undefined) missingTypeIds.push(id);
    else m3 += unit * quantity(line);
  }
  return { m3, missingTypeIds };
}

export type VolumeDisplayMode = { kind: 'complete' } | { kind: 'partial' } | { kind: 'unknown' };

export function volumeDisplayMode({ m3, missingTypeIds }: VolumeSum): VolumeDisplayMode {
  if (missingTypeIds.length === 0) return { kind: 'complete' };
  if (m3 === 0) return { kind: 'unknown' };
  return { kind: 'partial' };
}
