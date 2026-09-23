/**
 * Pure "how much m³ did this represent" logic for the Mining Yield Overview
 * tab and its detail modal (issue #1283) — split from `volumeDisplay.tsx`'s
 * rendering so this stays unit-testable without React Testing Library, and
 * to keep the component file Fast-Refresh-clean (`react-refresh/only-export-components`).
 */

export interface VolumeSum {
  m3: number;
  /** typeIds `typeVolumes` had no entry for. */
  missingTypeIds: number[];
}

/** Sums `unit * quantity` for each line, tracking which typeIds had no known unit volume. */
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

/**
 * Which of the three renderings a `VolumeSum` gets — never a bare em dash
 * unless NOTHING is known, and a partial sum only shown alongside its
 * warning marker (issue #1283).
 */
export function volumeDisplayMode({ m3, missingTypeIds }: VolumeSum): VolumeDisplayMode {
  if (missingTypeIds.length === 0) return { kind: 'complete' };
  if (m3 === 0) return { kind: 'unknown' };
  return { kind: 'partial' };
}
