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
    expect(securityBand(0.0)).toBe('nullsec');
    expect(securityBand(-0.5)).toBe('nullsec');
  });

  /**
   * ESI publishes the raw float; the game rounds it to one decimal and bands
   * the rounded value. Balle really is 0.4608891 in ESI and really is a 0.5
   * highsec system in game, with CONCORD in it. Banding the raw number called
   * it lowsec, which also picked the 1.9x lowsec rig multiplier for an
   * industry job that is entitled to the 1x highsec one.
   */
  it('bands the rounded status, the way the game displays and enforces it', () => {
    expect(securityBand(0.4608891010284424)).toBe('highsec'); // Balle, shown as 0.5
    expect(securityBand(0.45)).toBe('highsec');
    expect(securityBand(0.4499)).toBe('lowsec');
    expect(securityBand(0.05)).toBe('lowsec'); // rounds to 0.1
    expect(securityBand(0.0499)).toBe('nullsec');
  });

  it('leaves the real systems either side of every boundary where the game puts them', () => {
    expect(securityBand(0.9459131360054016)).toBe('highsec'); // Jita 0.9
    expect(securityBand(0.6587472558021545)).toBe('highsec'); // Badivefi 0.7
    expect(securityBand(0.5054402947425842)).toBe('highsec'); // Uedama 0.5
    expect(securityBand(0.2825556993484497)).toBe('lowsec'); // Tama 0.3
    expect(securityBand(-0.99)).toBe('nullsec'); // J-space
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

  it('reads pure danger red at the bottom of the scale (-1.0)', () => {
    expect(securityStatusColor(-1.0)).toBe('#ff7369');
  });

  /**
   * The game paints every nullsec system red; a gradient that ran amber from
   * 0.4 all the way down to -1.0 left a 0.0 system the same orange as a 0.1
   * lowsec one, hiding the boundary that matters most on a route.
   */
  it('paints every nullsec system danger red, at the boundary and below it', () => {
    expect(securityStatusColor(0.0)).toBe('#ff7369');
    expect(securityStatusColor(0.0499)).toBe('#ff7369'); // shown as 0.0
    expect(securityStatusColor(-0.25)).toBe('#ff7369');
    expect(securityStatusColor(-1.0)).toBe('#ff7369');
  });

  it('paints lowsec orange, deepening toward 0.1 but stopping short of red', () => {
    expect(securityStatusColor(0.4)).toBe('#fa965a');
    expect(securityStatusColor(0.4499)).toBe('#fa965a'); // shown as 0.4
    expect(securityStatusColor(0.25)).toBe('#fb8f5d');
    expect(securityStatusColor(0.1)).toBe('#fc8860');
    expect(securityStatusColor(0.05)).toBe('#fc8860'); // shown as 0.1
  });

  it('clamps above 1.0 to the same color as 1.0', () => {
    expect(securityStatusColor(1.5)).toBe(securityStatusColor(1.0));
  });

  it('clamps below -1.0 to the same color as -1.0', () => {
    expect(securityStatusColor(-2.0)).toBe(securityStatusColor(-1.0));
  });

  /**
   * The badge that carries this color prints `security.toFixed(1)` beside it,
   * so a raw 0.4730616 reads "0.5" in orange — a highsec system wearing the
   * lowsec color. Ainsan and Balle really are highsec in game; the boundary
   * belongs to `securityBand`, which rounds the way the game does. Only the
   * branch moves: the gradient inside each band still interpolates the raw
   * value, so neighbouring systems stay visually distinct.
   */
  it('colors on the rounded boundary, matching the number rendered beside it', () => {
    expect(securityStatusColor(0.4730616509914398)).toBe('#f5b94a'); // Ainsan, shown as 0.5
    expect(securityStatusColor(0.4608891010284424)).toBe('#f5b94a'); // Balle, shown as 0.5
    // Talidal (0.5097) already passed; it must not collapse onto the floor's
    // color — the gradient still interpolates the raw value inside the band.
    expect(securityStatusColor(0.509783148765564)).not.toBe(securityStatusColor(0.5));
  });

  it('leaves a system that really is lowsec on the orange side of the boundary', () => {
    expect(securityStatusColor(0.4499)).not.toBe('#f5b94a'); // shown as 0.4
    expect(securityStatusColor(0.2825556993484497)).not.toBe('#f5b94a'); // Tama 0.3
  });
});
