/**
 * The `public/data` files that stay OUT of the install precache and are
 * instead fetched on first use (cache-first, content-versioned, `src/sw.ts`'s
 * `sde-data` route) or by the idle background warm (`warmLazySde.ts`).
 *
 * One list, read by both `vite.config.ts` (`injectManifest.globIgnores`) and
 * the warm, so a file cannot be dropped from the precache without being warmed
 * (or vice versa) — they drifted once, leaving `market/systemPositions.json`
 * in neither. Paths are relative to `public/data/`, forward slashes.
 *
 * Pure data, importing only the import-free `typeInfoShard.ts`:
 * `vite.config.ts` loads this file at config time.
 * Everything in `public/data` NOT listed here is precached.
 */
import { TYPE_INFO_SHARD_COUNT } from './typeInfoShard';

export const LAZY_SDE_FILES: readonly string[] = [
  'masteries.json',
  'reprocessing.json',
  'marketWideTrees.json',
  'pi-planet-radius.json',
  'pi-system-planets.json',
  'typeNames.json',
  'market/types.json',
  'market/stations.json',
  'market/variations.json',
  // Item Detail typeInfo shards (issue #3882); every slot has a file (`{}` if
  // empty), so this is constant, not read from the build.
  ...Array.from({ length: TYPE_INFO_SHARD_COUNT }, (_, n) => `typeInfo/${n}.json`),
];

/** `injectManifest.globIgnores` entries for {@link LAZY_SDE_FILES}. */
export function lazySdeGlobIgnores(): string[] {
  return LAZY_SDE_FILES.map((file) => `**/data/${file}`);
}
