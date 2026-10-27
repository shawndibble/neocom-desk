import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import { eveClock, hoursLabel, initials, schematicOutputTypeId } from './coloniesFormat';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

describe('eveClock', () => {
  it('reads the day and time in EVE time (UTC), whatever zone the browser is in', () => {
    expect(eveClock(Date.parse('2026-10-07T02:00:00Z'))).toBe('Wed 02:00');
    expect(eveClock(Date.parse('2026-10-08T18:05:00Z'))).toBe('Thu 18:05');
  });
});

describe('hoursLabel', () => {
  it('uses hours under two days and days beyond', () => {
    expect(hoursLabel(6)).toBe('6 h');
    expect(hoursLabel(47.4)).toBe('47 h');
    expect(hoursLabel(47.6)).toBe('2 d');
    expect(hoursLabel(50)).toBe('2 d 2 h');
    expect(hoursLabel(72)).toBe('3 d');
  });
});

describe('schematicOutputTypeId', () => {
  it('maps a schematic id back to the type it produces', () => {
    const [typeId, schematic] = Object.entries(pi.schematics)[0];
    expect(schematicOutputTypeId(schematic.schematicId, pi)).toBe(Number(typeId));
  });
  it('is null for an unknown schematic', () => {
    expect(schematicOutputTypeId(-1, pi)).toBeNull();
  });
});

describe('initials', () => {
  it('takes the first letters of the first two words, or the first two letters', () => {
    expect(initials('Vela Arrano')).toBe('VA');
    expect(initials('Sorin')).toBe('SO');
  });
});
