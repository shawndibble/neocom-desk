import { useCorpAccess } from './useCorpAccess';
import type { CorpCapabilities } from '@/engine/corpRoles';

export type CorpDenialReason = 'not-granted' | 'roles-without-grant' | 'none' | 'capability';

export type CorpRouteGate =
  | { status: 'loading' }
  | { status: 'failed'; retry: () => void }
  | { status: 'denied'; reason: CorpDenialReason }
  | { status: 'ready'; capabilities: CorpCapabilities };

export function useCorpRouteGate(
  requires?: (capabilities: CorpCapabilities) => boolean
): CorpRouteGate {
  const { state, capabilities, readFailed, retry } = useCorpAccess();

  if (state === 'unknown') return readFailed ? { status: 'failed', retry } : { status: 'loading' };
  if (state !== 'ready') return { status: 'denied', reason: state };
  if (requires !== undefined && !requires(capabilities)) {
    return { status: 'denied', reason: 'capability' };
  }
  return { status: 'ready', capabilities };
}
