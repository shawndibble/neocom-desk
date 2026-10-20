import { useEffect, useState } from 'react';
import { loadAccountingLevel } from '@/features/pi/salesTaxRate';

/**
 * The Character's trained Accounting level, null with nobody active or while
 * their skills are unknown — never a made-up 0, which would show the
 * untrained tax rate as if it were theirs.
 */
export function useAccountingLevel(characterId: number | null): number | null {
  const [loaded, setLoaded] = useState<{ characterId: number; level: number | null } | null>(null);
  useEffect(() => {
    if (characterId === null) return;
    let cancelled = false;
    void loadAccountingLevel(characterId, Date.now()).then((level) => {
      if (!cancelled) setLoaded({ characterId, level });
    });
    return () => {
      cancelled = true;
    };
  }, [characterId]);
  return loaded !== null && loaded.characterId === characterId ? loaded.level : null;
}
