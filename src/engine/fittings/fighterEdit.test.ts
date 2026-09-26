import { describe, expect, it } from 'vitest';
import { addSquadron, canLaunch, removeSquadron, setSquadron } from './fighterEdit';
import type { Fitting } from './types';

const carrier: Fitting = { name: 'C', shipTypeId: 23911, modules: [], drones: [], cargo: [] };

describe('fighter edits', () => {
  it('adds a full squadron, launched while a tube is free and to the bay after', () => {
    const one = addSquadron(carrier, 23055, { launch: true });
    expect(one.fighters).toEqual([{ typeId: 23055, quantity: 6, state: 'active' }]);
    const two = addSquadron(one, 37599, { launch: false });
    expect(two.fighters?.[1]).toEqual({ typeId: 37599, quantity: 3, state: 'online' });
    // The Fitting it came from is untouched.
    expect(carrier).not.toHaveProperty('fighters');
  });

  it('launches, recalls and resizes one squadron, keeping it within a full squadron', () => {
    const fitting = addSquadron(carrier, 23055, { launch: true });
    expect(setSquadron(fitting, 0, { state: 'online' }).fighters?.[0].state).toBe('online');
    expect(setSquadron(fitting, 0, { quantity: 4 }).fighters?.[0].quantity).toBe(4);
    expect(setSquadron(fitting, 0, { quantity: 40 }).fighters?.[0].quantity).toBe(6);
    expect(setSquadron(fitting, 0, { quantity: 0 }).fighters?.[0].quantity).toBe(1);
  });

  it('removes a squadron, and the key with the last one', () => {
    const fitting = addSquadron(addSquadron(carrier, 23055, { launch: true }), 23055, {
      launch: true,
    });
    expect(removeSquadron(fitting, 0).fighters).toHaveLength(1);
    expect(removeSquadron(removeSquadron(fitting, 0), 0)).not.toHaveProperty('fighters');
  });
});

describe('canLaunch', () => {
  const limits = { tubes: 4, light: 3, support: 2, heavy: 0 };
  const launched = (typeId: number) => ({ typeId, quantity: 6, state: 'active' as const });

  it('launches while a tube and the class both have room', () => {
    expect(canLaunch([], 23055, limits)).toBe(true);
  });

  it('stops at the class limit even with a tube free', () => {
    const three = [launched(23055), launched(23055), launched(23055)];
    expect(canLaunch(three, 23055, limits)).toBe(false);
    expect(canLaunch(three, 37599, limits)).toBe(true);
  });

  it('stops when every tube is taken, and never launches what the hull has no class room for', () => {
    const four = [launched(23055), launched(23055), launched(37599), launched(37599)];
    expect(canLaunch(four, 37599, limits)).toBe(false);
    expect(canLaunch([], 32325, limits)).toBe(false);
  });
});
