import { describe, expect, it } from 'vitest';
import { fitGoalOptions } from './fitGoalOptions';

describe('fitGoalOptions', () => {
  it('reads a Fitting whose requirements could not be determined as unknown, never flyable', () => {
    const [option] = fitGoalOptions(
      [{ id: 'f1', name: 'Rifter' }],
      new Map(),
      new Map(),
      [],
      new Map(),
      new Date(0),
      new Set(['f1'])
    );
    expect(option).toEqual({ id: 'f1', name: 'Rifter', state: 'unknown' });
  });

  it('keeps a Fitting that is simply not loaded yet as loading', () => {
    const [option] = fitGoalOptions(
      [{ id: 'f1', name: 'Rifter' }],
      new Map(),
      new Map(),
      [],
      new Map(),
      new Date(0),
      new Set()
    );
    expect(option.state).toBe('loading');
  });

  it('reads a loaded Fitting that needs nothing as flyable now', () => {
    const [option] = fitGoalOptions(
      [{ id: 'f1', name: 'Rifter' }],
      new Map([['f1', { id: 'f1', name: 'Rifter', needed: [] }]]),
      new Map(),
      [],
      new Map(),
      new Date(0),
      new Set()
    );
    expect(option.state).toBe('flyable-now');
  });
});
