import { describe, expect, it } from 'vitest';
import { lazyAssetWarmLevel } from './lazyAssetWarmGate';

describe('lazyAssetWarmLevel', () => {
  it('warms everything on an online, unmetered, unknown-quality connection', () => {
    expect(lazyAssetWarmLevel({ online: true })).toBe('all');
  });

  it('warms everything on wifi/4g', () => {
    expect(lazyAssetWarmLevel({ online: true, effectiveType: '4g', type: 'wifi' })).toBe('all');
  });

  it('warms nothing offline', () => {
    expect(lazyAssetWarmLevel({ online: false })).toBe('none');
  });

  it('warms nothing under Save-Data', () => {
    expect(lazyAssetWarmLevel({ online: true, saveData: true })).toBe('none');
  });

  it.each(['slow-2g', '2g', '3g'])('warms nothing on %s', (effectiveType) => {
    expect(lazyAssetWarmLevel({ online: true, effectiveType })).toBe('none');
  });

  it('skips the ~10 MB engine on a cellular connection, keeps the small files', () => {
    expect(lazyAssetWarmLevel({ online: true, effectiveType: '4g', type: 'cellular' })).toBe(
      'small'
    );
  });
});
