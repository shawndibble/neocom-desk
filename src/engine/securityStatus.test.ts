import { describe, it, expect } from 'vitest';
import { securityBand, securityStatusColor, shownSecurity } from './securityStatus';

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
    expect(securityBand(0.0)).toBe('nullsec');
    expect(securityBand(-0.5)).toBe('nullsec');
  });

  it('bands the rounded status, the way the game displays and enforces it', () => {
    expect(securityBand(0.4608891010284424)).toBe('highsec');
    expect(securityBand(0.45)).toBe('highsec');
    expect(securityBand(0.4499)).toBe('lowsec');
    expect(securityBand(0.05)).toBe('lowsec');
    expect(securityBand(0.0499)).toBe('lowsec');
  });

  it('rounds a positive status under 0.05 up to 0.1 lowsec, as CCP does', () => {
    expect(shownSecurity(0.0346)).toBe(0.1);
    expect(shownSecurity(0.0499)).toBe(0.1);
    expect(securityBand(0.0346)).toBe('lowsec');
    expect(shownSecurity(0)).toBe(0);
    expect(securityBand(0)).toBe('nullsec');
    expect(securityBand(-0.04)).toBe('nullsec');
  });

  it('leaves the real systems either side of every boundary where the game puts them', () => {
    expect(securityBand(0.9459131360054016)).toBe('highsec');
    expect(securityBand(0.6587472558021545)).toBe('highsec');
    expect(securityBand(0.5054402947425842)).toBe('highsec');
    expect(securityBand(0.2825556993484497)).toBe('lowsec');
    expect(securityBand(-0.99)).toBe('nullsec');
  });
});

describe('securityStatusColor', () => {
  it('reads warning yellow at the highsec floor (0.5), the way the game does', () => {
    expect(securityStatusColor(0.5)).toBe('#f5b94a');
  });

  it('reads pure success green at 0.7', () => {
    expect(securityStatusColor(0.7)).toBe('#5fd584');
  });

  it('reads pure accent blue at the top of the scale (1.0)', () => {
    expect(securityStatusColor(1.0)).toBe('#57c7f4');
  });

  it('blends yellow to green, then green to blue, across highsec', () => {
    expect(securityStatusColor(0.6)).toBe('#aac767');
    expect(securityStatusColor(0.8)).toBe('#5cd0a9');
  });

  it('paints every nullsec system danger red, at the boundary and below it', () => {
    expect(securityStatusColor(0.0)).toBe('#ff7369');
    expect(securityStatusColor(-0.25)).toBe('#ff7369');
    expect(securityStatusColor(-1.0)).toBe('#ff7369');
    expect(securityStatusColor(-2.0)).toBe('#ff7369');
  });

  it('paints lowsec orange, deepening toward 0.1 but stopping short of red', () => {
    expect(securityStatusColor(0.4)).toBe('#f99d56');
    expect(securityStatusColor(0.4499)).toBe('#f99d56');
    expect(securityStatusColor(0.25)).toBe('#fa965a');
    expect(securityStatusColor(0.1)).toBe('#fb8f5d');
    expect(securityStatusColor(0.05)).toBe('#fb8f5d');
    expect(securityStatusColor(0.0499)).toBe('#fb8f5d');
  });

  it('clamps above 1.0 to the same color as 1.0', () => {
    expect(securityStatusColor(1.5)).toBe(securityStatusColor(1.0));
  });

  it('colors on the rounded boundary, matching the number rendered beside it', () => {
    expect(securityStatusColor(0.4730616509914398)).toBe('#f5b94a');
    expect(securityStatusColor(0.4608891010284424)).toBe('#f5b94a');
    expect(securityStatusColor(0.509783148765564)).not.toBe(securityStatusColor(0.5));
  });

  it('leaves a system that really is lowsec on the orange side of the boundary', () => {
    expect(securityStatusColor(0.4499)).not.toBe('#f5b94a');
    expect(securityStatusColor(0.2825556993484497)).not.toBe('#f5b94a');
  });
});
