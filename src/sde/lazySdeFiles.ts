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
import { TYPE_INFO_SHARD_COUNT } from './typeInfoShard.ts';

export const LAZY_SDE_FILES: readonly string[] = [
  // Item Detail typeInfo shards (issue #3882); every slot has a file (`{}` if
  // empty), so this is constant, not read from the build. First: Show Info is
  // a core local feature and the shards are small. The warm fetches the
  // dogma engine right after this block (`LAZY_SDE_PRIORITY_COUNT`).
  ...Array.from({ length: TYPE_INFO_SHARD_COUNT }, (_, n) => `typeInfo/${n}.json`),
  'masteries.json',
  'typeNames.json',
  'pi-planet-radius.json',
  'pi-system-planets.json',
  'reprocessing.json',
  'marketWideTrees.json',
  'invention.json',
  // NPC agents (~140 KB gzip), read only by the Contacts standings view and the
  // NPC agent card. `npcCorporations.json` (~6 KB gzip, every corporation's
  // faction and headquarters) is the small shared lookup that stays precached.
  'agents.json',
];

/**
 * How many leading {@link LAZY_SDE_FILES} the warm fetches before the dogma
 * engine; the rest follow it, so a short session reaches the engine (it
 * unlocks Fittings stats) before the low-value files.
 */
export const LAZY_SDE_PRIORITY_COUNT = TYPE_INFO_SHARD_COUNT;

/** `injectManifest.globIgnores` entries for {@link LAZY_SDE_FILES}. */
export function lazySdeGlobIgnores(): string[] {
  return LAZY_SDE_FILES.map((file) => `**/data/${file}`);
}
