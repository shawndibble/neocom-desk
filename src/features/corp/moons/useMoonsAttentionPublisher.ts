import { useEffect } from 'react';
import { publishMoonsAttention } from './moonsNavAttention';
import { useBook } from './useBook';
import { useNeedsYou } from './useNeedsYou';

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
