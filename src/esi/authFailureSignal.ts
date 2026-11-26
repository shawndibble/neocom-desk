import type { EsiEndpointId } from './registry';

type AuthFailureListener = (characterId: number, endpointId?: EsiEndpointId) => void;

const listeners = new Set<AuthFailureListener>();

export function onEsiAuthFailure(listener: AuthFailureListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitEsiAuthFailure(characterId: number, endpointId?: EsiEndpointId): void {
  for (const listener of listeners) {
    try {
      if (endpointId === undefined) listener(characterId);
      else listener(characterId, endpointId);
    } catch {}
  }
}

type RoleRefusalListener = (characterId: number, endpointId?: EsiEndpointId) => void;

const roleListeners = new Set<RoleRefusalListener>();

export function onEsiRoleRefusal(listener: RoleRefusalListener): () => void {
  roleListeners.add(listener);
  return () => roleListeners.delete(listener);
}

export function emitEsiRoleRefusal(characterId: number, endpointId?: EsiEndpointId): void {
  for (const listener of roleListeners) {
    try {
      if (endpointId === undefined) listener(characterId);
      else listener(characterId, endpointId);
    } catch {}
  }
}
