import { describe, it, expect } from 'vitest';
import { securityBand, securityStatusColor } from './securityStatus';

describe('securityBand', () => {
  it('classifies 0.5 and above as highsec', () => {
    expect(securityBand(1.0)).toBe('highsec');
    expect(securityBand(0.5)).toBe('highsec');
  });

  it('classifies 0.1 up to 0.5 as lowsec', () => {
    expect(securityBand(0.4)).toBe('lowsec');
    expect(securityBand(0.1)).toBe('lowsec');
  });

  it('classifies below 0.1 as nullsec', () => {
    expect(securityBand(0.05)).toBe('nullsec');
    expect(securityBand(0.0)).toBe('nullsec');
    expect(securityBand(-0.5)).toBe('nullsec');
  });
});

describe('securityStatusColor', () => {
  it('reads pure success green at the highsec floor (0.5)', () => {
    expect(securityStatusColor(0.5)).toBe('#5fd584');
  });

  it('reads pure accent blue at the top of the scale (1.0)', () => {
    expect(securityStatusColor(1.0)).toBe('#57c7f4');
  });

  it('blends success toward accent across the highsec band', () => {
    expect(securityStatusColor(0.75)).toBe('#5bcebc');
  });

  it('reads pure danger red at the bottom of the scale (-1.0)', () => {
    expect(securityStatusColor(-1.0)).toBe('#ff7369');
  });

  it('blends warning toward danger across lowsec and nullsec', () => {
    expect(securityStatusColor(-0.25)).toBe('#fa965a');
  });

  it('clamps above 1.0 to the same color as 1.0', () => {
    expect(securityStatusColor(1.5)).toBe(securityStatusColor(1.0));
  });

  it('clamps below -1.0 to the same color as -1.0', () => {
    expect(securityStatusColor(-2.0)).toBe(securityStatusColor(-1.0));
  });
});
