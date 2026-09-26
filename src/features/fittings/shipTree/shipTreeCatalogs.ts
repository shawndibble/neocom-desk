/**
 * The Ship Tree's skill and blueprint catalogs, built once per session. The
 * loaders stay unmemoized (`skillMap.ts` says why); a failed load isn't kept.
 */
import { loadBlueprintCatalog, type BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { loadSkillCatalog, type SkillCatalog } from '@/features/skills/skillMap';

function cachedLoad<T>(load: () => Promise<T>) {
  let pending: Promise<T> | null = null;
  return {
    get(): Promise<T> {
      if (!pending) {
        const p: Promise<T> = load().catch((err: unknown) => {
          if (pending === p) pending = null;
          throw err;
        });
        pending = p;
      }
      return pending;
    },
    clear() {
      pending = null;
    },
  };
}

const skills = cachedLoad(() => loadSkillCatalog());
const blueprints = cachedLoad(() => loadBlueprintCatalog());

export const shipTreeSkillCatalog = (): Promise<SkillCatalog> => skills.get();
export const shipTreeBlueprintCatalog = (): Promise<BlueprintCatalog> => blueprints.get();

/** Test-only: lets each test's loader mocks be called afresh. */
export function clearShipTreeCatalogCache(): void {
  skills.clear();
  blueprints.clear();
}
