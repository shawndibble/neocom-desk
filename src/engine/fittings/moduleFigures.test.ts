import { describe, expect, it } from 'vitest';
import { extractModuleFigures, NO_MODULE_FIGURES } from './moduleFigures';

const mod = (
  attrs: Record<number, number>,
  state = 'active',
  slot = 'medium',
  charge?: object
) => ({
  item: { slot: { type: slot } },
  result: {
    state,
    charge,
    attributes: { get: (id: number) => (id in attrs ? { value: attrs[id] } : undefined) },
  },
});

const extract = (...mods: ReturnType<typeof mod>[]) =>
  extractModuleFigures(
    mods.map((m) => m.item),
    mods.map((m) => m.result)
  );

describe('extractModuleFigures', () => {
  it('is all zero with no modules', () => {
    expect(extract()).toEqual(NO_MODULE_FIGURES);
  });

  it('takes the longest reactivation delay, in seconds', () => {
    expect(extract(mod({ 669: 30000 }), mod({ 669: 10000 }), mod({})).reactivationSeconds).toBe(30);
  });

  it('counts a reload only on a loaded non-weapon', () => {
    expect(extract(mod({ 1795: 60000 }, 'active', 'medium', {})).reloadSeconds).toBe(60);
    expect(extract(mod({ 1795: 60000 })).reloadSeconds).toBe(0);
    expect(extract(mod({ 1795: 5000, [-12]: 40 }, 'active', 'high', {})).reloadSeconds).toBe(0);
  });

  it('pairs a salvager chance with its own range', () => {
    const figures = extract(mod({ 902: 15, 54: 10000 }), mod({ 902: 10, 54: 12000 }));
    expect(figures.salvageChance).toBe(15);
    expect(figures.salvagerRange).toBe(12000);
  });

  it('reads tractor speed and range off a tractor only', () => {
    const figures = extract(mod({ 1045: 1500, 54: 50000 }), mod({ 54: 90000 }));
    expect(figures.tractorVelocity).toBe(1500);
    expect(figures.tractorRange).toBe(50000);
  });

  it('reads the scanner ranges', () => {
    const figures = extract(mod({ 126: 60000 }), mod({ 125: 120000 }));
    expect(figures.cargoScanRange).toBe(60000);
    expect(figures.shipScanRange).toBe(120000);
  });

  it('skips an offline module', () => {
    expect(extract(mod({ 669: 30000 }, 'offline')).reactivationSeconds).toBe(0);
  });
});
