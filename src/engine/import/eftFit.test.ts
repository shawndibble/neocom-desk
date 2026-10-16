import { describe, it, expect } from 'vitest';
import { looksLikeEftFit, parseEftFit } from '@/engine/import/eftFit';

describe('parseEftFit', () => {
  it('parses hull + fit name from the header line', () => {
    const result = parseEftFit('[Rifter, My Fit]\n\nDamage Control II');
    expect(result.shipName).toBe('Rifter');
    expect(result.fitName).toBe('My Fit');
    expect(result.headerLine).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it('parses a fit name that itself contains a comma', () => {
    const result = parseEftFit('[Rifter, Kite, cheap]\n\nDamage Control II');
    expect(result.shipName).toBe('Rifter');
    expect(result.fitName).toBe('Kite, cheap');
    expect(result.errors).toEqual([]);
  });

  it('parses a bare [Ship] header, keeping the hull and leaving the fit name empty', () => {
    const result = parseEftFit('[Buzzard]\n\nDamage Control II');
    expect(result.shipName).toBe('Buzzard');
    expect(result.fitName).toBe('');
    expect(result.errors).toEqual([]);
  });

  it('parses a header whose fit name is present but empty', () => {
    const result = parseEftFit('[Buzzard, ]\n\nDamage Control II');
    expect(result.shipName).toBe('Buzzard');
    expect(result.fitName).toBe('');
    expect(result.errors).toEqual([]);
  });

  it('parses a fit name wrapped in its own brackets', () => {
    const result = parseEftFit('[Rifter, [PVP]]\n\nDamage Control II');
    expect(result.shipName).toBe('Rifter');
    expect(result.fitName).toBe('[PVP]');
    expect(result.errors).toEqual([]);
  });

  it('reports the header line number even when the paste starts with blank lines', () => {
    const result = parseEftFit('\n\n[Rifter, My Fit]\n\nDamage Control II');
    expect(result.shipName).toBe('Rifter');
    expect(result.headerLine).toBe(3);
    expect(result.items).toEqual([{ name: 'Damage Control II', quantity: 1, line: 5 }]);
  });

  it('rejects a header with no ship name, rather than reading the fit name as a hull', () => {
    const result = parseEftFit('[ , Max Hacker]\n\nDamage Control II');
    expect(result.shipName).toBe('');
    expect(result.fitName).toBe('');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].line).toBe(1);
  });

  it('rejects a fit body pasted without its header, not reading [Empty x slot] as a hull', () => {
    const result = parseEftFit('[Empty high slot]\nDamage Control II');
    expect(result.shipName).toBe('');
    expect(result.errors).toHaveLength(1);
    expect(result.items).toEqual([{ name: 'Damage Control II', quantity: 1, line: 2 }]);
  });

  it('parses module lines across blank-line-separated slot sections', () => {
    const text = [
      '[Rifter, My Fit]',
      '',
      'Damage Control II',
      '',
      '1MN Afterburner II',
      'Small Shield Extender II',
      '',
      '125mm Gatling AutoCannon II',
      '125mm Gatling AutoCannon II',
    ].join('\n');
    const result = parseEftFit(text);
    expect(result.items).toEqual([
      { name: 'Damage Control II', quantity: 1, line: 3 },
      { name: '1MN Afterburner II', quantity: 1, line: 5 },
      { name: 'Small Shield Extender II', quantity: 1, line: 6 },
      { name: '125mm Gatling AutoCannon II', quantity: 1, line: 8 },
      { name: '125mm Gatling AutoCannon II', quantity: 1, line: 9 },
    ]);
    expect(result.errors).toEqual([]);
  });

  it('splits a module + charge line ("Module, Ammo") into two items (T2 ammo)', () => {
    const result = parseEftFit(
      '[Rifter, My Fit]\n\n125mm Gatling AutoCannon II, Republic Fleet EMP S'
    );
    // Only the charge half carries `isCharge` — the flag marks ammo a module
    // was left loaded with, so Fit Import can decline to quote a launcher
    // count as a production batch (issue #626). Both halves report the one
    // source line they were written on.
    expect(result.items).toEqual([
      { name: '125mm Gatling AutoCannon II', quantity: 1, line: 3 },
      { name: 'Republic Fleet EMP S', quantity: 1, line: 3, isCharge: true },
    ]);
  });

  it('parses drone/cargo quantity suffix ("xN")', () => {
    const result = parseEftFit('[Rifter, My Fit]\n\n\nWarrior II x5\nNanite Repair Paste x50');
    expect(result.items).toEqual([
      { name: 'Warrior II', quantity: 5, line: 4 },
      { name: 'Nanite Repair Paste', quantity: 50, line: 5 },
    ]);
  });

  it('skips [Empty X slot] placeholders', () => {
    const result = parseEftFit(
      '[Rifter, My Fit]\n\n[Empty Low slot]\nDamage Control II\n\n[Empty High slot]'
    );
    expect(result.items).toEqual([{ name: 'Damage Control II', quantity: 1, line: 4 }]);
  });

  it('parses offline modules, stripping the /offline suffix from the name', () => {
    const result = parseEftFit('[Rifter, My Fit]\n\nInertial Stabilizers II /offline');
    expect(result.items).toEqual([{ name: 'Inertial Stabilizers II', quantity: 1, line: 3 }]);
  });

  it('tolerates Windows line endings (CRLF)', () => {
    const result = parseEftFit('[Rifter, My Fit]\r\n\r\nDamage Control II\r\n');
    expect(result.shipName).toBe('Rifter');
    expect(result.items).toEqual([{ name: 'Damage Control II', quantity: 1, line: 3 }]);
  });

  it('handles an empty paste: no throw, header error, no items', () => {
    expect(() => parseEftFit('')).not.toThrow();
    const result = parseEftFit('');
    expect(result.shipName).toBe('');
    expect(result.fitName).toBe('');
    expect(result.items).toEqual([]);
    expect(result.errors).toEqual([
      {
        line: 1,
        text: '',
        reason: 'invalid or missing fit header, expected "[Ship Name]" or "[Ship Name, Fit Name]"',
      },
    ]);
  });

  it('handles garbage text with no valid header: no throw, header error reported', () => {
    expect(() => parseEftFit('not a fit\nrandom garbage')).not.toThrow();
    const result = parseEftFit('not a fit\nrandom garbage');
    expect(result.shipName).toBe('');
    expect(result.fitName).toBe('');
    expect(result.errors).toEqual([
      {
        line: 1,
        text: 'not a fit',
        reason: 'invalid or missing fit header, expected "[Ship Name]" or "[Ship Name, Fit Name]"',
      },
    ]);
  });

  it('is a pure text-structure parse: unknown-looking names are not errors', () => {
    const result = parseEftFit('[Rifter, My Fit]\n\nTotally Made Up Module Name XYZ');
    expect(result.items).toEqual([
      { name: 'Totally Made Up Module Name XYZ', quantity: 1, line: 3 },
    ]);
    expect(result.errors).toEqual([]);
  });

  it('parses a full realistic pyfa-shaped fit exercising every rule together', () => {
    const text = [
      '[Rifter, Kite Fit]',
      '',
      'Nanofiber Internal Structure I',
      'Damage Control II /offline',
      '',
      '1MN Afterburner II',
      '[Empty Med slot]',
      '',
      '125mm Gatling AutoCannon II, Republic Fleet EMP S',
      '125mm Gatling AutoCannon II, Republic Fleet EMP S',
      '[Empty High slot]',
      '',
      'Small Polycarbon Engine Housing I',
      '',
      'Warrior II x5',
      '',
      '',
      'Nanite Repair Paste x50',
    ].join('\n');
    const result = parseEftFit(text);
    expect(result.shipName).toBe('Rifter');
    expect(result.fitName).toBe('Kite Fit');
    expect(result.errors).toEqual([]);
    expect(result.items).toEqual([
      { name: 'Nanofiber Internal Structure I', quantity: 1, line: 3 },
      { name: 'Damage Control II', quantity: 1, line: 4 },
      { name: '1MN Afterburner II', quantity: 1, line: 6 },
      { name: '125mm Gatling AutoCannon II', quantity: 1, line: 9 },
      { name: 'Republic Fleet EMP S', quantity: 1, line: 9, isCharge: true },
      { name: '125mm Gatling AutoCannon II', quantity: 1, line: 10 },
      { name: 'Republic Fleet EMP S', quantity: 1, line: 10, isCharge: true },
      { name: 'Small Polycarbon Engine Housing I', quantity: 1, line: 13 },
      { name: 'Warrior II', quantity: 5, line: 15 },
      { name: 'Nanite Repair Paste', quantity: 50, line: 18 },
    ]);
  });
});

// Pyfa's mutated-item layout: see the eftFit.ts header.
const PYFA_MUTATED = [
  '[Vexor Navy Issue, Abyssal]',
  'Damage Control II [1]',
  'Drone Damage Amplifier II',
  '',
  'Heavy Gremlin Compact Energy Neutralizer /offline [2]',
  '',
  'Hobgoblin II x2 [3]',
  'Hobgoblin II x3',
  '',
  '',
  '[1] Damage Control II',
  '  Unstable Damage Control Mutaplasmid',
  '  armorEmDamageResonance 0.65, capacitorNeed 0.9, hullEmDamageResonance oops',
  '[2] Heavy Gremlin Compact Energy Neutralizer',
  '  Gravid Heavy Energy Neutralizer Mutaplasmid',
  '  capacitorNeed 419.25, energyNeutralizerAmount 591.36, maxRange 15680',
  '[3] Hobgoblin II',
  '  Exigent Light Drone Firepower Mutaplasmid',
].join('\n');

describe('parseEftFit — Pyfa mutated items', () => {
  it('strips the reference off the item line, base name kept', () => {
    const fit = parseEftFit(PYFA_MUTATED);
    expect(fit.items.map((i) => [i.name, i.quantity, i.mutationRef])).toEqual([
      ['Damage Control II', 1, 1],
      ['Drone Damage Amplifier II', 1, undefined],
      ['Heavy Gremlin Compact Energy Neutralizer', 1, 2],
      ['Hobgoblin II', 2, 3],
      ['Hobgoblin II', 3, undefined],
    ]);
    expect(fit.errors).toEqual([]);
  });

  it('reads each block — base, mutaplasmid, rolls — and emits none of it as an item', () => {
    const fit = parseEftFit(PYFA_MUTATED);
    expect(fit.mutations).toEqual([
      {
        ref: 1,
        line: 11,
        baseName: 'Damage Control II',
        mutaplasmidName: 'Unstable Damage Control Mutaplasmid',
        // An unreadable value is skipped, as Pyfa does.
        attributes: [
          { name: 'armorEmDamageResonance', value: 0.65 },
          { name: 'capacitorNeed', value: 0.9 },
        ],
      },
      {
        ref: 2,
        line: 14,
        baseName: 'Heavy Gremlin Compact Energy Neutralizer',
        mutaplasmidName: 'Gravid Heavy Energy Neutralizer Mutaplasmid',
        attributes: [
          { name: 'capacitorNeed', value: 419.25 },
          { name: 'energyNeutralizerAmount', value: 591.36 },
          { name: 'maxRange', value: 15680 },
        ],
      },
      {
        ref: 3,
        line: 17,
        baseName: 'Hobgoblin II',
        mutaplasmidName: 'Exigent Light Drone Firepower Mutaplasmid',
        attributes: [],
      },
    ]);
  });

  it('keeps a charge and the reference apart', () => {
    const fit = parseEftFit('[Rifter]\nHeavy Missile Launcher II, Scourge Heavy Missile [4]\n');
    expect(fit.items).toEqual([
      { name: 'Heavy Missile Launcher II', quantity: 1, line: 2, mutationRef: 4 },
      { name: 'Scourge Heavy Missile', quantity: 1, line: 2, isCharge: true },
    ]);
  });

  it('reads lines after a block with no blank line as items, not as the block', () => {
    const fit = parseEftFit(
      [
        '[Rifter]',
        'Damage Control II [1]',
        '[1] Damage Control II',
        '  Unstable Damage Control Mutaplasmid',
        '  capacitorNeed 0.9',
        'Drone Damage Amplifier II',
        '[2] Damage Control II',
        '  Unstable Damage Control Mutaplasmid',
        'Overdrive Injector System II',
      ].join('\n')
    );
    expect(fit.items.map((i) => i.name)).toEqual([
      'Damage Control II',
      'Drone Damage Amplifier II',
      'Overdrive Injector System II',
    ]);
    expect(fit.mutations.map((b) => [b.ref, b.attributes])).toEqual([
      [1, [{ name: 'capacitorNeed', value: 0.9 }]],
      [2, []],
    ]);
  });

  it('gives a plain paste no mutations and no mutationRef', () => {
    const fit = parseEftFit('[Rifter]\nDamage Control II\n');
    expect(fit.mutations).toEqual([]);
    expect(Object.keys(fit.items[0]!)).not.toContain('mutationRef');
  });
});

describe('looksLikeEftFit', () => {
  it('recognizes a fit by its bracketed first non-blank line', () => {
    expect(looksLikeEftFit('[Rifter, My Fit]\n\nDamage Control II')).toBe(true);
  });

  it('ignores leading blank lines and indentation', () => {
    expect(looksLikeEftFit('\n\n   [Rifter, My Fit]\nDamage Control II')).toBe(true);
  });

  it('still recognizes a fit whose header is malformed, so the error can be reported', () => {
    expect(looksLikeEftFit('[Rifter, My Fit\nDamage Control II')).toBe(true);
  });

  it('rejects an inventory or multibuy paste', () => {
    expect(looksLikeEftFit('Tritanium\t124,500\nPyerite 500')).toBe(false);
    expect(looksLikeEftFit('Damage Control II')).toBe(false);
  });

  it('rejects empty text', () => {
    expect(looksLikeEftFit('')).toBe(false);
    expect(looksLikeEftFit('\n\n  \n')).toBe(false);
  });
});
