import { create } from 'zustand';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { onDeadGrant } from '@/auth/deadGrantSignal';
import { onEsiAuthFailure, onEsiRoleRefusal } from '@/esi/authFailureSignal';
import type { EsiEndpointId } from '@/esi/registry';

export type AuthFailureKind = 'token' | 'request' | 'role';

export interface AuthFailure {
  characterId: number;
  kind: AuthFailureKind;
  endpointId?: EsiEndpointId;
}

export const useNeedsLogin = createLocalSetting<readonly number[]>({
  key: 'auth.needsLogin',
  defaultValue: [],
  parse: (raw) =>
    Array.isArray(raw) && raw.every((id) => Number.isInteger(id)) ? (raw as number[]) : null,
});

let pendingUpdates = 0;
let updates: Promise<void> = Promise.resolve();

function updateNeedsLogin(change: (ids: readonly number[]) => readonly number[]): Promise<void> {
  pendingUpdates += 1;
  const run = updates.then(async () => {
    try {
      await useNeedsLogin.getState().hydrate();
      const ids = useNeedsLogin.getState().value;
      const next = change(ids);
      if (next !== ids) await useNeedsLogin.getState().setValue(next);
    } finally {
      pendingUpdates -= 1;
    }
  });
  updates = run.catch(() => undefined);
  return run;
}

export async function needsLoginIds(): Promise<readonly number[]> {
  await updates;
  await useNeedsLogin.getState().hydrate();
  return useNeedsLogin.getState().value;
}

export function markNeedsLogin(characterId: number): Promise<void> {
  return updateNeedsLogin((ids) => (ids.includes(characterId) ? ids : [...ids, characterId]));
}

export function clearNeedsLogin(characterId: number): Promise<void> {
  const { hydrated, value } = useNeedsLogin.getState();
  if (hydrated && pendingUpdates === 0 && !value.includes(characterId)) return Promise.resolve();
  return updateNeedsLogin((ids) =>
    ids.includes(characterId) ? ids.filter((id) => id !== characterId) : ids
  );
}

interface AuthFailureState {
  failure: AuthFailure | null;
  reportTokenFailure: (characterId: number) => void;
  reportRequestFailure: (characterId: number, endpointId?: EsiEndpointId) => void;
  reportRoleRefusal: (characterId: number, endpointId?: EsiEndpointId) => void;
  dismiss: () => void;
  clearFor: (characterId: number, kind?: AuthFailureKind) => void;
}

function outranks(next: AuthFailureKind, current: AuthFailure | null): boolean {
  return current === null || next === 'token' || current.kind !== 'token';
}

export const useAuthFailure = create<AuthFailureState>((set, get) => ({
  failure: null,
  reportTokenFailure: (characterId) => {
    void markNeedsLogin(characterId);
    set({ failure: { characterId, kind: 'token' } });
  },
  reportRequestFailure: (characterId, endpointId) => {
    if (!outranks('request', get().failure)) return;
    set({ failure: { characterId, kind: 'request', endpointId } });
  },
  reportRoleRefusal: (characterId, endpointId) => {
    if (!outranks('role', get().failure)) return;
    set({
      failure: { characterId, kind: 'role', ...(endpointId !== undefined ? { endpointId } : {}) },
    });
  },
  dismiss: () => {
    set({ failure: null });
  },
  clearFor: (characterId, kind) => {
    if (kind === undefined || kind === 'token') void clearNeedsLogin(characterId);
    const { failure } = get();
    if (!failure || failure.characterId !== characterId) return;
    if (kind !== undefined && failure.kind !== kind) return;
    set({ failure: null });
  },
}));

export function subscribeToEsiAuthFailures(): () => void {
  const offRequest = onEsiAuthFailure((characterId, endpointId) => {
    useAuthFailure.getState().reportRequestFailure(characterId, endpointId);
  });
  const offGrant = onDeadGrant((characterId) => {
    useAuthFailure.getState().reportTokenFailure(characterId);
  });
  const offRole = onEsiRoleRefusal((characterId, endpointId) => {
    useAuthFailure.getState().reportRoleRefusal(characterId, endpointId);
  });
  return () => {
    offRequest();
    offGrant();
    offRole();
  };
}

export function reportEsiAuthFailure(characterId: number): void {
  useAuthFailure.getState().reportRequestFailure(characterId);
}
