import { HOUR_MS } from '@/lib/age';
import { describe, it, expect } from 'vitest';
import { diffCloneJumpReady, type CloneJumpEntrySnapshot, type CloneJumpReadyFire } from './index';
import { occurrenceKey, occurrenceFiredAt } from '../occurrenceKey';
import { projectCloneJump, projectionWording, PROJECTION_HORIZON_MS } from '../projection';

const T0 = 1_800_000_000_000;
const ME = 42;

function entry(overrides: Partial<CloneJumpEntrySnapshot> = {}): CloneJumpEntrySnapshot {
  return { lastJumpMs: T0 - 20 * HOUR_MS, readyAtMs: T0 + HOUR_MS, ...overrides };
}

const snap = (nowMs: number, ...entries: CloneJumpEntrySnapshot[]) => ({ entries, nowMs });

describe('diffCloneJumpReady', () => {
  it('fires nothing without a baseline, even after the ready time', () => {
    expect(diffCloneJumpReady(ME, undefined, snap(T0 + 2 * HOUR_MS, entry()))).toEqual([]);
  });

  it('fires once when the ready time falls between polls', () => {
    const prev = snap(T0, entry());
    const next = snap(T0 + 2 * HOUR_MS, entry());
    expect(diffCloneJumpReady(ME, prev, next)).toEqual([
      {
        eventId: 'cloneJumpReady',
        characterId: ME,
        lastJumpMs: T0 - 20 * HOUR_MS,
        readyAtMs: T0 + HOUR_MS,
      },
    ]);
  });

  it('fires when the ready time lands exactly on the poll', () => {
    expect(diffCloneJumpReady(ME, snap(T0, entry()), snap(T0 + HOUR_MS, entry()))).toHaveLength(1);
  });

  it('fires nothing while the cooldown is still running', () => {
    expect(diffCloneJumpReady(ME, snap(T0, entry()), snap(T0 + HOUR_MS / 2, entry()))).toEqual([]);
  });

  it('does not re-fire on later polls', () => {
    const prev = snap(T0 + 2 * HOUR_MS, entry());
    const next = snap(T0 + 3 * HOUR_MS, entry());
    expect(diffCloneJumpReady(ME, prev, next)).toEqual([]);
  });

  it('fires nothing for a Character who has never jumped', () => {
    expect(diffCloneJumpReady(ME, snap(T0), snap(T0 + 2 * HOUR_MS))).toEqual([]);
  });
});

describe('cloneJumpReady occurrence key', () => {
  const fire: CloneJumpReadyFire = {
    eventId: 'cloneJumpReady',
    characterId: ME,
    lastJumpMs: T0 - 20 * HOUR_MS,
    readyAtMs: T0 + HOUR_MS,
  };

  it('is stable across polls and differs per jump', () => {
    const key = occurrenceKey(fire, T0);
    expect(occurrenceKey({ ...fire }, T0 + 5 * HOUR_MS)).toBe(key);
    expect(occurrenceKey({ ...fire, lastJumpMs: T0 }, T0)).not.toBe(key);
  });

  it('agrees across devices that read a different Infomorph Synchronizing level', () => {
    expect(occurrenceKey({ ...fire, readyAtMs: T0 + 5 * HOUR_MS }, T0)).toBe(
      occurrenceKey(fire, T0)
    );
  });

  it('is dated at the ready time, not the poll that noticed it', () => {
    expect(occurrenceFiredAt(fire, T0 + 9 * HOUR_MS)).toBe(T0 + HOUR_MS);
  });
});

describe('projectCloneJump', () => {
  const copy = () => ({ title: 't', body: 'b' });

  it('asserts its wording', () => {
    expect(projectionWording('cloneJumpReady')).toBe('assert');
  });

  it('projects one row at the ready time', () => {
    const rows = projectCloneJump(ME, 'Kestrel', [entry()], copy, T0);
    expect(rows).toHaveLength(1);
    expect(rows[0].eventId).toBe('cloneJumpReady');
    expect(rows[0].fireAt).toBe(T0 + HOUR_MS);
  });

  it('skips a ready time already past or beyond the horizon', () => {
    const past = entry({ readyAtMs: T0 - HOUR_MS });
    const far = entry({ readyAtMs: T0 + PROJECTION_HORIZON_MS + HOUR_MS });
    expect(projectCloneJump(ME, 'Kestrel', [past, far], copy, T0)).toEqual([]);
  });

  it('projects nothing for a Character who has never jumped', () => {
    expect(projectCloneJump(ME, 'Kestrel', [], copy, T0)).toEqual([]);
  });
});
