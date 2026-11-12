import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearVettingHandle, readVettingHandle, writeVettingHandle } from './vettingHandle';

const handle = { corporationId: 98000001, reviewId: 'r-1', key: 'secret' };

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('vetting handle storage', () => {
  it('finds the handle it stored, per slot', () => {
    writeVettingHandle('apply:98000001', handle);
    expect(readVettingHandle('apply:98000001')).toEqual(handle);
    expect(readVettingHandle('apply:98000002')).toBeNull();
    expect(readVettingHandle('request:98000001')).toBeNull();
  });

  it('forgets a cleared handle', () => {
    writeVettingHandle('apply:98000001', handle);
    clearVettingHandle('apply:98000001');
    expect(readVettingHandle('apply:98000001')).toBeNull();
  });

  it('reads anything malformed as no handle', () => {
    localStorage.setItem('neocom.vetting.apply:1', 'not json');
    expect(readVettingHandle('apply:1')).toBeNull();
    localStorage.setItem('neocom.vetting.apply:1', JSON.stringify({ corporationId: 1 }));
    expect(readVettingHandle('apply:1')).toBeNull();
    localStorage.setItem(
      'neocom.vetting.apply:1',
      JSON.stringify({ corporationId: '1', reviewId: 'r', key: 'k' })
    );
    expect(readVettingHandle('apply:1')).toBeNull();
  });

  it('never throws when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => writeVettingHandle('apply:1', handle)).not.toThrow();
    expect(readVettingHandle('apply:1')).toBeNull();
    expect(() => clearVettingHandle('apply:1')).not.toThrow();
  });
});
