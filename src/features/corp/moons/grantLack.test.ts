import { describe, expect, it } from 'vitest';
import { grantLack } from './grantLack';

describe('grantLack', () => {
  it('says what the grant lacks; unknown is no lack', () => {
    expect(grantLack({ refineryNamesGranted: false })).toBe('names');
    expect(grantLack({ refineryNamesGranted: true, chunkOreGranted: false })).toBe('ore');
    expect(grantLack({ refineryNamesGranted: false, chunkOreGranted: false })).toBe('both');
    expect(grantLack({ refineryNamesGranted: true, chunkOreGranted: true })).toBeNull();
    expect(grantLack({})).toBeNull();
  });
});
