import { useEffect, useMemo, useRef, useState } from 'react';
import {
  planBookToleranceRecordChanges,
  type RecordChange,
  type ToleranceBookInput,
} from '@/engine/miningTax/recordChanges';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { loadRecordChanges, recordChangesReady, saveRecordChanges } from '../recordChangeStore';
import type { CorpBookView } from './corpBookView';

const NONE: readonly RecordChange[] = [];

function bookInputs(view: CorpBookView): ToleranceBookInput[] {
  return view.books.map((b) => ({
    corporationId: b.loaded.corporationId,
    characterIds: b.loaded.characterIds,
    miners: b.loaded.miners,
    accounts: b.summary.miners,
  }));
}

export function useToleranceRecordChanges(
  view: CorpBookView | null,
  reloadKey: string
): readonly RecordChange[] {
  const stored = useKeyedLoad(reloadKey, loadRecordChanges).data;
  const [added, setAdded] = useState<readonly RecordChange[]>(NONE);
  const tried = useRef(new Set<string>());

  useEffect(() => {
    if (!view || !stored) return;
    const existing = new Set([...stored.map((c) => c.id), ...tried.current]);
    const planned = planBookToleranceRecordChanges(bookInputs(view), existing);
    if (planned.length === 0) return;
    const ids = planned.map((p) => p.change.id);
    for (const id of ids) tried.current.add(id);
    const forget = () => {
      for (const id of ids) tried.current.delete(id);
    };
    const characterIds = [...new Set(planned.map((p) => p.characterId))];
    void recordChangesReady(characterIds)
      .then(async (ready) => {
        if (!ready) return forget();
        const saved = await saveRecordChanges(planned);
        if (saved.length > 0) setAdded((prev) => [...prev, ...saved]);
      })
      .catch(forget);
  }, [view, stored]);

  return useMemo(() => {
    if (!stored) return added;
    const known = new Set(stored.map((c) => c.id));
    const fresh = added.filter((c) => !known.has(c.id));
    return fresh.length === 0 ? stored : [...stored, ...fresh];
  }, [stored, added]);
}
