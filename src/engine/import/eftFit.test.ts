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
