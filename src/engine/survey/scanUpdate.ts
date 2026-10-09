/**
 * Is a freshly pasted Survey Scan the same mining field as a Survey's latest
 * scan, only smaller? Belts don't spawn rocks while a pilot mines, so an update
 * shows only ores the latest scan already had, none with more m³. Pure.
 */
import type { SurveyRock } from './series';

/**
 * How much an ore may read above its previous m³ and still be the same field:
 * the scanner rounds, and a pilot who flies closer can pull a rock into range.
 */
export const SCAN_UPDATE_TOLERANCE = 0.01;

function volumeByOre(rocks: readonly SurveyRock[]): Map<string, number> {
  const byOre = new Map<string, number>();
  for (const rock of rocks) byOre.set(rock.ore, (byOre.get(rock.ore) ?? 0) + rock.volume);
  return byOre;
}

/**
 * `'update'` when every ore in `pasted` was in `latest` with no more m³ (within
 * the tolerance); `'different'` when an ore is new or one grew. `latest` is
 * null before the Survey's first scan, when there is nothing to update.
 */
export function classifyScan(
  latest: readonly SurveyRock[] | null,
  pasted: readonly SurveyRock[]
): 'update' | 'different' {
  if (latest === null) return 'different';
  const before = volumeByOre(latest);
  for (const [ore, volume] of volumeByOre(pasted)) {
    const was = before.get(ore);
    if (was === undefined || volume > was * (1 + SCAN_UPDATE_TOLERANCE)) return 'different';
  }
  return 'update';
}

/**
 * The field a Survey has shown so far: each ore at its m³ in the newest scan
 * that showed it. An ore that dropped out of range (or that the scanner skipped)
 * and then comes back belongs to the same field, so a paste is compared against
 * this rather than only the latest scan. `scans` run oldest to newest; null
 * before the first one.
 */
export function lastSeenField(scans: readonly (readonly SurveyRock[])[]): SurveyRock[] | null {
  if (scans.length === 0) return null;
  const seen = new Map<string, number>();
  for (const rocks of scans) {
    for (const [ore, volume] of volumeByOre(rocks)) seen.set(ore, volume);
  }
  return [...seen].map(([ore, volume]) => ({ ore, volume }));
}
