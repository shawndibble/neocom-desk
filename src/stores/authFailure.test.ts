import { describe, it, expect, beforeEach } from 'vitest';
import { reportEsiAuthFailure, useAuthFailure } from './authFailure';

const CHARACTER_ID = 5;

beforeEach(() => {
  useAuthFailure.setState({ failure: null });
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
