import type { EsiEndpointId } from './registry';

export type ActivityOutcome = 'success' | 'authFailure' | 'error';

export interface ActivityEvent {
  readonly endpointId: EsiEndpointId;
  readonly characterId?: number;
  readonly timestamp: number;
  readonly outcome: ActivityOutcome;
}

type ActivityListener = (event: ActivityEvent) => void;

const listeners = new Set<ActivityListener>();

export function onEsiActivity(listener: ActivityListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitEsiActivity(event: ActivityEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {}
  }
}
