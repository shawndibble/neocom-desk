import { useEffect, useState } from 'react';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { LAWLESS_POLL_MS, loadLawlessSystems } from './lawlessSystems';

const NONE: ReadonlySet<number> = new Set();

export function useLawlessSystems(): ReadonlySet<number> {
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const [lawless, setLawless] = useState<ReadonlySet<number>>(NONE);
  useEffect(() => {
    if (characterId === null) return;
    let cancelled = false;
    const load = () =>
      void loadLawlessSystems().then((next) => {
        if (!cancelled) setLawless(next.size === 0 ? NONE : next);
      });
    load();
    const timer = setInterval(load, LAWLESS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [characterId]);
  return characterId === null ? NONE : lawless;
}
