import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadGroupNames } from '@/features/market/groupNames';
import { loadGroupCategories, loadTypes } from '@/sde/loadSde';
import { buildHullCatalog, type HullCatalog } from './hullCatalog';

export interface HullCatalogState {
  /** Null while the SDE loads. */
  catalog: HullCatalog | null;
  className: (classId: number) => string;
}

/**
 * Hulls and classes from the shipped SDE, class names from ESI's group names (cached for good,
 * `loadGroupNames`). A class whose name is unknown reads "Class <id>" rather than vanishing.
 */
export function useHullCatalog(): HullCatalogState {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<HullCatalog | null>(null);
  const [names, setNames] = useState<ReadonlyMap<number, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadTypes(), loadGroupCategories()])
      .then(async ([types, categories]) => {
        const built = buildHullCatalog(types, categories);
        if (cancelled) return;
        setCatalog(built);
        const resolved = await loadGroupNames(built.classIds);
        if (!cancelled) setNames(resolved);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const className = useMemo(
    () => (classId: number) =>
      names.get(classId) ?? t('srp.settings.hullRules.classFallback', { id: classId }),
    [names, t]
  );
  return { catalog, className };
}
