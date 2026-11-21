import { useEffect, useState } from 'react';
import type { VerifyRow } from '@/engine/corpTaxBook/verifyView';
import { loadTypeNames } from '@/features/character/typeNames';

/** The names of the ores a Late notice's lines bill, loaded once; ids show until they arrive. */
export function useOreNames(rows: readonly VerifyRow[]): ReadonlyMap<number, string> {
  const [oreNames, setOreNames] = useState<ReadonlyMap<number, string>>(new Map());
  useEffect(() => {
    const ids = rows.flatMap((r) => r.ores.map((o) => o.typeId));
    if (ids.length === 0) return;
    let cancelled = false;
    loadTypeNames(ids).then(
      (names) => {
        if (!cancelled) setOreNames(names);
      },
      () => undefined
    );
    return () => {
      cancelled = true;
    };
  }, [rows]);
  return oreNames;
}
