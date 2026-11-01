import { describe, it, expect } from 'vitest';
import {
  advance,
  coverageFromForChoice,
  current,
  isDone,
  progress,
  recordOutcome,
  skip,
  startRun,
  stop,
  type AddCorpsCandidate,
} from './addCorpsRun';

const corps: AddCorpsCandidate[] = [1, 2, 3].map((n) => ({
  corporationId: n,
  ceoCharacterId: 100 + n,
  name: `Corp ${n}`,
  ceoName: `Pilot ${n}`,
}));

const fresh = () => startRun({ collectorCorporationId: 9, editorCharacterId: 50, queue: corps });

describe('startRun', () => {
  it('begins on the first corp with no outcomes', () => {
    const run = fresh();
    expect(current(run)?.corporationId).toBe(1);
    expect(run.outcomes).toEqual({});
    expect(progress(run)).toEqual({ done: 0, total: 3 });
    expect(isDone(run)).toBe(false);
  });

  it('keeps the coverage day when given', () => {
    const run = startRun({
      collectorCorporationId: 9,
      editorCharacterId: 50,
      queue: corps,
      coverageFrom: '2026-10-01',
    });
    expect(run.coverageFrom).toBe('2026-10-01');
  });

  it('is done at once for an empty queue', () => {
    expect(isDone(startRun({ collectorCorporationId: 9, editorCharacterId: 50, queue: [] }))).toBe(
      true
    );
  });
});

describe('recordOutcome', () => {
  it('moves past a connected corp', () => {
    const run = recordOutcome(fresh(), { kind: 'connected' });
    expect(current(run)?.corporationId).toBe(2);
    expect(run.outcomes[1]).toEqual({ kind: 'connected' });
    expect(progress(run).done).toBe(1);
  });

  it('stays on the same corp after the wrong character, recording who signed in', () => {
    const run = recordOutcome(fresh(), { kind: 'wrong-character', signedInAs: 'Someone' });
    expect(current(run)?.corporationId).toBe(1);
    expect(run.lastOutcome).toEqual({
      corporationId: 1,
      outcome: { kind: 'wrong-character', signedInAs: 'Someone' },
    });
    expect(progress(run).done).toBe(0);
  });

  it('a later success on the corp replaces the wrong-character note', () => {
    const wrong = recordOutcome(fresh(), { kind: 'wrong-character', signedInAs: 'X' });
    const run = recordOutcome(wrong, { kind: 'connected' });
    expect(run.outcomes[1]).toEqual({ kind: 'connected' });
    expect(current(run)?.corporationId).toBe(2);
  });

  it('turns a refusal into a skip that keeps the reason', () => {
    const run = recordOutcome(fresh(), { kind: 'refused', reason: 'not-an-accountant' });
    expect(run.outcomes[1]).toEqual({ kind: 'refused', reason: 'not-an-accountant' });
    expect(current(run)?.corporationId).toBe(2);
  });

  it('moves on after a cancelled sign-in, remembering it', () => {
    const run = recordOutcome(fresh(), { kind: 'cancelled' });
    expect(run.outcomes[1]).toEqual({ kind: 'cancelled' });
    expect(current(run)?.corporationId).toBe(2);
  });

  it('does nothing once the run is done', () => {
    const done = stop(fresh());
    expect(recordOutcome(done, { kind: 'connected' })).toBe(done);
  });
});

describe('skip, advance and stop', () => {
  it('skip records a skipped outcome and moves on', () => {
    const run = skip(fresh());
    expect(run.outcomes[1]).toEqual({ kind: 'skipped' });
    expect(current(run)?.corporationId).toBe(2);
  });

  it('advance steps over corps that already have a finished outcome', () => {
    const run = advance({ ...fresh(), outcomes: { 1: { kind: 'connected' } } });
    expect(current(run)?.corporationId).toBe(2);
  });

  it('finishes after the last corp and reports full progress', () => {
    let run = fresh();
    run = recordOutcome(run, { kind: 'connected' });
    run = skip(run);
    run = recordOutcome(run, { kind: 'cancelled' });
    expect(isDone(run)).toBe(true);
    expect(current(run)).toBeUndefined();
    expect(progress(run)).toEqual({ done: 3, total: 3 });
  });

  it('stop ends the run but keeps what happened so far', () => {
    const run = stop(recordOutcome(fresh(), { kind: 'connected' }));
    expect(isDone(run)).toBe(true);
    expect(run.outcomes[1]).toEqual({ kind: 'connected' });
    expect(run.outcomes[2]).toBeUndefined();
  });
});

describe('coverageFromForChoice', () => {
  it('today is today, fixed once for the whole batch', () => {
    expect(coverageFromForChoice('today', '2026-11-01')).toBe('2026-11-01');
  });
  it('counts back whole UTC days', () => {
    expect(coverageFromForChoice(7, '2026-11-01')).toBe('2026-10-25');
    expect(coverageFromForChoice(30, '2026-11-01')).toBe('2026-10-02');
    expect(coverageFromForChoice(14, '2026-03-05')).toBe('2026-02-19');
  });
});
