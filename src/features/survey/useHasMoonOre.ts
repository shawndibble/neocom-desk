import { useEffect, useState } from 'react';
import { loadMoonOreTypeIds, loadTypes } from '@/sde/loadSde';

/** Whether any of these scanner ore names is a moon ore (raw form, as the scanner prints it). */
export function useHasMoonOre(oreNames: readonly string[]): boolean {
  const key = [...new Set(oreNames)].sort().join('\n');
  const [found, setFound] = useState<{ key: string; moon: boolean } | null>(null);
  useEffect(() => {
    if (key === '') return;
    let cancelled = false;
    void Promise.all([loadMoonOreTypeIds(), loadTypes()])
      .then(([ids, types]) => {
        const wanted = new Set(key.split('\n'));
        const moon = ids.some((id) => wanted.has(types[String(id)]?.name ?? ''));
        if (!cancelled) setFound({ key, moon });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key]);
  return found?.key === key && found.moon;
}
