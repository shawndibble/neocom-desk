import { useMemo } from 'react';
import { mayBeBlueprintName } from '@/engine/blueprintKind';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { loadBlueprints } from '@/sde/loadSde';
import type { BlueprintMap } from '@/sde/types';

let built: { source: BlueprintMap; ids: ReadonlySet<number> } | null = null;

function blueprintTypeIdSet(source: BlueprintMap): ReadonlySet<number> {
  if (built?.source !== source) {
    built = { source, ids: new Set(Object.keys(source).map(Number)) };
  }
  return built.ids;
}

const loadBlueprintTypeIds = () => loadBlueprints().then(blueprintTypeIdSet);

export function useBlueprintTypeIds(
  typeNames: ReadonlyMap<number, string>
): ReadonlySet<number> | null {
  const enabled = useMemo(() => [...typeNames.values()].some(mayBeBlueprintName), [typeNames]);
  const { data } = useKeyedLoad(enabled ? 'blueprints' : null, loadBlueprintTypeIds);
  return data ?? null;
}
