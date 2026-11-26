import { useMemo } from 'react';
import { popShareMarks, type PopShareMarks } from '@/engine/corpTaxBook/popShareMarks';
import { useBook } from './useBook';
import { usePopSharing } from './usePopSharing';

export function usePopShareMarks(): PopShareMarks | null {
  const { view, data, characterId, corporationId } = useBook();
  const { load } = usePopSharing(characterId, corporationId);
  const doc = load.state === 'ready' ? load.doc : null;
  return useMemo(
    () => (doc ? popShareMarks(view.extractions, data.feeders ?? [], doc) : null),
    [doc, view.extractions, data.feeders]
  );
}
