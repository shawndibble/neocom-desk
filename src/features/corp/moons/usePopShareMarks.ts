import { useMemo } from 'react';
import { popShareMarks, type PopShareMarks } from '@/engine/corpTaxBook/popShareMarks';
import { useBook } from './useBook';
import { usePopSharing } from './usePopSharing';

/**
 * The book's Pop Sharing marks (issue #6226) for the Moons page's lists. Null while the
 * settings load, or when they cannot be read: the lists then show no marks, never wrong ones.
 */
export function usePopShareMarks(): PopShareMarks | null {
  const { view, data, characterId, corporationId } = useBook();
  const { load } = usePopSharing(characterId, corporationId);
  const doc = load.state === 'ready' ? load.doc : null;
  return useMemo(
    () => (doc ? popShareMarks(view.extractions, data.feeders ?? [], doc) : null),
    [doc, view.extractions, data.feeders]
  );
}
