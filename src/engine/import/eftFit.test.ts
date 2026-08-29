import { describe, it, expect } from 'vitest';
import { parseEftFit } from '@/engine/import/eftFit';

describe('parseEftFit', () => {
  it('parses hull + fit name from the header line', () => {
    const result = parseEftFit('[Rifter, My Fit]\n\nDamage Control II');
    expect(result.shipName).toBe('Rifter');
    expect(result.fitName).toBe('My Fit');
    expect(result.errors).toEqual([]);
  });

  it('parses a fit name that itself contains a comma', () => {
    const result = parseEftFit('[Rifter, Kite, cheap]\n\nDamage Control II');
    expect(result.shipName).toBe('Rifter');
    expect(result.fitName).toBe('Kite, cheap');
    expect(result.errors).toEqual([]);
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
      { name: 'Damage Control II', quantity: 1 },
      { name: '1MN Afterburner II', quantity: 1 },
      { name: 'Small Shield Extender II', quantity: 1 },
      { name: '125mm Gatling AutoCannon II', quantity: 1 },
      { name: '125mm Gatling AutoCannon II', quantity: 1 },
    ]);
    expect(result.errors).toEqual([]);
  });

  it('splits a module + charge line ("Module, Ammo") into two items (T2 ammo)', () => {
    const result = parseEftFit(
      '[Rifter, My Fit]\n\n125mm Gatling AutoCannon II, Republic Fleet EMP S'
    );
    expect(result.items).toEqual([
      { name: '125mm Gatling AutoCannon II', quantity: 1 },
      { name: 'Republic Fleet EMP S', quantity: 1 },
    ]);
  });

  it('parses drone/cargo quantity suffix ("xN")', () => {
    const result = parseEftFit('[Rifter, My Fit]\n\n\nWarrior II x5\nNanite Repair Paste x50');
    expect(result.items).toEqual([
      { name: 'Warrior II', quantity: 5 },
      { name: 'Nanite Repair Paste', quantity: 50 },
    ]);
  });

  it('skips [Empty X slot] placeholders', () => {
    const result = parseEftFit(
      '[Rifter, My Fit]\n\n[Empty Low slot]\nDamage Control II\n\n[Empty High slot]'
    );
    expect(result.items).toEqual([{ name: 'Damage Control II', quantity: 1 }]);
  });

  it('parses offline modules, stripping the /offline suffix from the name', () => {
    const result = parseEftFit('[Rifter, My Fit]\n\nInertial Stabilizers II /offline');
    expect(result.items).toEqual([{ name: 'Inertial Stabilizers II', quantity: 1 }]);
  });

  it('tolerates Windows line endings (CRLF)', () => {
    const result = parseEftFit('[Rifter, My Fit]\r\n\r\nDamage Control II\r\n');
    expect(result.shipName).toBe('Rifter');
    expect(result.items).toEqual([{ name: 'Damage Control II', quantity: 1 }]);
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
        reason: 'invalid or missing fit header, expected "[Ship Name, Fit Name]"',
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
        reason: 'invalid or missing fit header, expected "[Ship Name, Fit Name]"',
      },
    ]);
  });

  it('is a pure text-structure parse: unknown-looking names are not errors', () => {
    const result = parseEftFit('[Rifter, My Fit]\n\nTotally Made Up Module Name XYZ');
    expect(result.items).toEqual([{ name: 'Totally Made Up Module Name XYZ', quantity: 1 }]);
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
      { name: 'Nanofiber Internal Structure I', quantity: 1 },
      { name: 'Damage Control II', quantity: 1 },
      { name: '1MN Afterburner II', quantity: 1 },
      { name: '125mm Gatling AutoCannon II', quantity: 1 },
      { name: 'Republic Fleet EMP S', quantity: 1 },
      { name: '125mm Gatling AutoCannon II', quantity: 1 },
      { name: 'Republic Fleet EMP S', quantity: 1 },
      { name: 'Small Polycarbon Engine Housing I', quantity: 1 },
      { name: 'Warrior II', quantity: 5 },
      { name: 'Nanite Repair Paste', quantity: 50 },
    ]);
  });
});
