import { describe, expect, it } from 'vitest';
import { addSquadron, removeSquadron, setSquadron } from './fighterEdit';
import type { Fitting } from './types';

const carrier: Fitting = { name: 'C', shipTypeId: 23911, modules: [], drones: [], cargo: [] };

describe('fighter edits', () => {
  it('adds a full squadron, launched while a tube is free and to the bay after', () => {
    const one = addSquadron(carrier, 23055, { freeTubes: 1 });
    expect(one.fighters).toEqual([{ typeId: 23055, quantity: 6, state: 'active' }]);
    const two = addSquadron(one, 37599, { freeTubes: 0 });
    expect(two.fighters?.[1]).toEqual({ typeId: 37599, quantity: 3, state: 'online' });
    // The Fitting it came from is untouched.
    expect(carrier).not.toHaveProperty('fighters');
  });

  it('launches, recalls and resizes one squadron, keeping it within a full squadron', () => {
    const fitting = addSquadron(carrier, 23055, { freeTubes: 1 });
    expect(setSquadron(fitting, 0, { state: 'online' }).fighters?.[0].state).toBe('online');
    expect(setSquadron(fitting, 0, { quantity: 4 }).fighters?.[0].quantity).toBe(4);
    expect(setSquadron(fitting, 0, { quantity: 40 }).fighters?.[0].quantity).toBe(6);
    expect(setSquadron(fitting, 0, { quantity: 0 }).fighters?.[0].quantity).toBe(1);
  });

  it('removes a squadron, and the key with the last one', () => {
    const fitting = addSquadron(addSquadron(carrier, 23055, { freeTubes: 2 }), 23055, {
      freeTubes: 1,
    });
    expect(removeSquadron(fitting, 0).fighters).toHaveLength(1);
    expect(removeSquadron(removeSquadron(fitting, 0), 0)).not.toHaveProperty('fighters');
  });
});
