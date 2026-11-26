import { useCorpAccess } from './useCorpAccess';
import { useActiveCorporationId } from './owner';

export function useCorpNavVisible(): boolean {
  const { state } = useCorpAccess();
  const corporationId = useActiveCorporationId();
  return state === 'ready' && corporationId !== null;
}
