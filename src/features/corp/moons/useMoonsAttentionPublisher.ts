import { useEffect } from 'react';
import { publishMoonsAttention } from './moonsNavAttention';
import { useBook } from './useBook';
import { useNeedsYou } from './useNeedsYou';

/**
 * Mounted with the book (every Moons tab): hands the Moons nav dot what this
 * visit found (#6208). An editor's count and stop are stored; a viewer's are
 * cleared, so the dot is for editors only.
 */
export function useMoonsAttentionPublisher() {
  const { characterId, corporationId, canEdit, data } = useBook();
  const { count } = useNeedsYou();
  const syncStopped = data.scheduledSync?.status === 'stopped';
  useEffect(() => {
    void publishMoonsAttention(
      characterId,
      corporationId,
      canEdit ? { needsYou: count, syncStopped } : null
    ).catch((err) => console.warn('Moons nav dot could not be stored', err));
  }, [characterId, corporationId, canEdit, count, syncStopped]);
}
