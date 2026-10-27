import { describe, expect, it } from 'vitest';
import en from './locales/en.json';

describe('travel.stops.dragInstructions', () => {
  it('does not promise move buttons that do not exist', () => {
    expect(en.travel.stops.dragInstructions).not.toMatch(/buttons?/i);
  });
});
