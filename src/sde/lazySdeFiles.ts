import { TYPE_INFO_SHARD_COUNT } from './typeInfoShard.ts';

export const LAZY_SDE_FILES: readonly string[] = [
  ...Array.from({ length: TYPE_INFO_SHARD_COUNT }, (_, n) => `typeInfo/${n}.json`),
  'masteries.json',
  'typeNames.json',
  'pi-planet-radius.json',
  'pi-system-planets.json',
  'market/gates.json',
  'reprocessing.json',
  'marketWideTrees.json',
  'invention.json',
  'agents.json',
];

export const LAZY_SDE_PRIORITY_COUNT = TYPE_INFO_SHARD_COUNT;

export function lazySdeGlobIgnores(): string[] {
  return LAZY_SDE_FILES.map((file) => `**/data/${file}`);
}
