import { describe, expect, it } from 'vitest';
import { eventApplicability, applicableCharacterIds } from './eventApplicability';
import { NOTIFICATION_EVENTS } from './events';

const scopeOf = (id: string) => NOTIFICATION_EVENTS.find((e) => e.id === id)!.scope!;

describe('eventApplicability', () => {
  it('is enabled when the character holds the event scope', () => {
    const state = eventApplicability('newMail', new Set([scopeOf('newMail')]), undefined);
    expect(state.rowEnabled).toBe(true);
    expect(state.hasScope).toBe(true);
  });

  it('is disabled for scope when the scope is missing', () => {
    const state = eventApplicability('newMail', new Set(), undefined);
    expect(state).toMatchObject({ hasScope: false, rowEnabled: false, capabilityMissing: false });
  });

  it('always applies to an event with no scope (Quickbar price alerts)', () => {
    expect(eventApplicability('priceAlertTriggered', new Set(), undefined).rowEnabled).toBe(true);
  });

  it('reads an unresolved corp capability as held, never a false lock', () => {
    const scopes = new Set([scopeOf('corpMemberJoined')]);
    expect(eventApplicability('corpMemberJoined', scopes, undefined).rowEnabled).toBe(true);
  });
});

describe('applicableCharacterIds', () => {
  it('keeps only characters the event applies to, in the given order', () => {
    const scopes = new Map<number, ReadonlySet<string>>([
      [1, new Set([scopeOf('newMail')])],
      [2, new Set()],
      [3, new Set([scopeOf('newMail')])],
    ]);
    expect(applicableCharacterIds('newMail', [3, 2, 1], scopes, new Map())).toEqual([3, 1]);
  });
});
