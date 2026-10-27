import { describe, expect, it } from 'vitest';
import { mailSafe } from './mailSafe';

describe('mailSafe', () => {
  it('strips angle brackets', () => {
    expect(mailSafe('Pals <font color="red">')).toBe('Pals font color="red"');
  });
});
