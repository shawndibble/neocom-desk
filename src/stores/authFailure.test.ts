import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/db';
import {
  clearNeedsLogin,
  markNeedsLogin,
  needsLoginIds,
  reportEsiAuthFailure,
  subscribeToEsiAuthFailures,
  useAuthFailure,
  useNeedsLogin,
} from './authFailure';
import { emitEsiAuthFailure } from '@/esi/authFailureSignal';
import { emitDeadGrant } from '@/auth/deadGrantSignal';

const CHARACTER_ID = 5;

beforeEach(async () => {
  useAuthFailure.setState({ failure: null });
  await db.settings.delete('auth.needsLogin');
  useNeedsLogin.setState({ value: [], hydrated: true });
});

describe('useAuthFailure', () => {
  it('starts empty — nothing is wrong until something says so', () => {
    expect(useAuthFailure.getState().failure).toBeNull();
  });

  it('records a request failure published from the read-through cache', () => {
    reportEsiAuthFailure(CHARACTER_ID);
    expect(useAuthFailure.getState().failure).toEqual({
      characterId: CHARACTER_ID,
      kind: 'request',
    });
  });

  it('lets a token failure supersede a request failure', () => {
    useAuthFailure.getState().reportRequestFailure(CHARACTER_ID);
    useAuthFailure.getState().reportTokenFailure(CHARACTER_ID);
    expect(useAuthFailure.getState().failure?.kind).toBe('token');
  });

  it('does not let a single refused request downgrade a dead grant', () => {
    useAuthFailure.getState().reportTokenFailure(CHARACTER_ID);
    useAuthFailure.getState().reportRequestFailure(CHARACTER_ID);
    expect(useAuthFailure.getState().failure?.kind).toBe('token');
  });

  it('is dismissible, so an ESI 403 the user cannot fix by re-authing never pins on', () => {
    reportEsiAuthFailure(CHARACTER_ID);
    useAuthFailure.getState().dismiss();
    expect(useAuthFailure.getState().failure).toBeNull();
  });

  it('clears only the character it is about', () => {
    reportEsiAuthFailure(CHARACTER_ID);
    useAuthFailure.getState().clearFor(CHARACTER_ID + 1);
    expect(useAuthFailure.getState().failure).not.toBeNull();

    useAuthFailure.getState().clearFor(CHARACTER_ID);
    expect(useAuthFailure.getState().failure).toBeNull();
  });

  it('clears only the named kind when one is given', () => {
    reportEsiAuthFailure(CHARACTER_ID);
    useAuthFailure.getState().clearFor(CHARACTER_ID, 'token');
    expect(useAuthFailure.getState().failure?.kind).toBe('request');

    useAuthFailure.getState().clearFor(CHARACTER_ID, 'request');
    expect(useAuthFailure.getState().failure).toBeNull();
  });
});

describe('subscribeToEsiAuthFailures', () => {
  it('receives what esi publishes, so esi needs no import of this store', () => {
    const unsubscribe = subscribeToEsiAuthFailures();
    emitEsiAuthFailure(42);
    expect(useAuthFailure.getState().failure).toMatchObject({ kind: 'request', characterId: 42 });
    unsubscribe();
  });

  it('keeps the endpoint that failed, so the notice can ask for its Permission', () => {
    const unsubscribe = subscribeToEsiAuthFailures();
    emitEsiAuthFailure(42, 'postCharacterMail');
    expect(useAuthFailure.getState().failure).toMatchObject({
      kind: 'request',
      characterId: 42,
      endpointId: 'postCharacterMail',
    });
    unsubscribe();
  });

  it('stops receiving after unsubscribe', () => {
    subscribeToEsiAuthFailures()();
    useAuthFailure.setState({ failure: null });
    emitEsiAuthFailure(42);
    expect(useAuthFailure.getState().failure).toBeNull();
  });

  describe('needs-sign-in mark', () => {
    const marks = () => useNeedsLogin.getState().value;

    it('is set by a token failure for any character, not only the active one', async () => {
      useAuthFailure.getState().reportTokenFailure(CHARACTER_ID + 1);
      await vi.waitFor(() => expect(marks()).toEqual([CHARACTER_ID + 1]));
    });

    it('survives dismissing the failure that triggered the redirect', async () => {
      useAuthFailure.getState().reportTokenFailure(CHARACTER_ID);
      useAuthFailure.getState().dismiss();
      await vi.waitFor(() => expect(marks()).toEqual([CHARACTER_ID]));
    });

    it('survives a reload: the store rehydrates it from this device', async () => {
      await markNeedsLogin(CHARACTER_ID);
      useNeedsLogin.setState({ value: [], hydrated: false });
      expect(await needsLoginIds()).toEqual([CHARACTER_ID]);
    });

    it('keeps the stored marks when a new one lands before hydration', async () => {
      await db.settings.put({ key: 'auth.needsLogin', value: [CHARACTER_ID] });
      useNeedsLogin.setState({ value: [], hydrated: false });
      await markNeedsLogin(CHARACTER_ID + 1);
      expect(marks()).toEqual([CHARACTER_ID, CHARACTER_ID + 1]);
    });

    it('does not record the same character twice', async () => {
      await markNeedsLogin(CHARACTER_ID);
      await markNeedsLogin(CHARACTER_ID);
      expect(marks()).toEqual([CHARACTER_ID]);
    });

    it('clears when the grant works again (sign-in), for that character only', async () => {
      await markNeedsLogin(CHARACTER_ID);
      await markNeedsLogin(CHARACTER_ID + 1);
      useAuthFailure.getState().clearFor(CHARACTER_ID, 'token');
      await vi.waitFor(() => expect(marks()).toEqual([CHARACTER_ID + 1]));
      useNeedsLogin.setState({ value: [], hydrated: false });
      expect(await needsLoginIds()).toEqual([CHARACTER_ID + 1]);
    });

    it('survives a request-kind clear, which says nothing about the grant', async () => {
      await markNeedsLogin(CHARACTER_ID);
      useAuthFailure.getState().clearFor(CHARACTER_ID, 'request');
      await clearNeedsLogin(CHARACTER_ID + 1);
      expect(marks()).toEqual([CHARACTER_ID]);
    });
  });
});

describe('subscribeToEsiAuthFailures: dead grant', () => {
  it('reports a token failure when any caller hits a dead grant', () => {
    const off = subscribeToEsiAuthFailures();
    emitDeadGrant(CHARACTER_ID);
    off();
    expect(useAuthFailure.getState().failure).toEqual({
      characterId: CHARACTER_ID,
      kind: 'token',
    });
  });
});
