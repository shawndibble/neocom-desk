import { useEffect, useState } from 'react';
import { loadPlannableIndex, type PlannableIndex } from './plannableProduct';

export function usePlannableIndexOnOpen(): {
  index: PlannableIndex | null;
  onOpenChange: (open: boolean) => void;
} {
  const [index, setIndex] = useState<PlannableIndex | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (attempt === 0 || index) return;
    let cancelled = false;
    void loadPlannableIndex().then(
      (next) => {
        if (!cancelled) setIndex(next);
      },
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [attempt, index]);

  return {
    index,
    onOpenChange: (open) => {
      if (open && !index) setAttempt((n) => n + 1);
    },
  };
}
