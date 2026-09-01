import { describe, it, expect } from 'vitest';
import { cloneJumpCooldown, cloneJumpCooldownHours } from './cloneJump';

describe('cloneJumpCooldownHours', () => {
  it('is the 24h base with no Infomorph Synchronizing trained', () => {
    expect(cloneJumpCooldownHours(0)).toBe(24);
  });

  it('drops by one hour per skill level', () => {
    expect(cloneJumpCooldownHours(3)).toBe(21);
    expect(cloneJumpCooldownHours(5)).toBe(19);
  });

  it('floors at 0 rather than going negative', () => {
    expect(cloneJumpCooldownHours(30)).toBe(0);
  });
});

describe('cloneJumpCooldown', () => {
  const now = new Date('2026-08-15T12:00:00Z');

  it('is not on cooldown when the character has never jumped clones', () => {
    expect(cloneJumpCooldown(undefined, 0, now)).toEqual({ onCooldown: false, readyAt: null });
    expect(cloneJumpCooldown(null, 0, now)).toEqual({ onCooldown: false, readyAt: null });
  });

  it('is not on cooldown once readyAt has passed', () => {
    // 24h - 3 = 21h cooldown; last jump was 22h before now.
    const lastJump = new Date(now.getTime() - 22 * 3_600_000).toISOString();
    const result = cloneJumpCooldown(lastJump, 3, now);
    expect(result.onCooldown).toBe(false);
    expect(result.readyAt).toEqual(new Date(now.getTime() - 1 * 3_600_000));
  });

  it('is on cooldown while readyAt is still in the future', () => {
    // 21h cooldown; last jump was 10h before now, 11h left.
    const lastJump = new Date(now.getTime() - 10 * 3_600_000).toISOString();
    const result = cloneJumpCooldown(lastJump, 3, now);
    expect(result.onCooldown).toBe(true);
    expect(result.readyAt).toEqual(new Date(now.getTime() + 11 * 3_600_000));
  });

  it('treats an unparseable date as no history rather than throwing', () => {
    expect(cloneJumpCooldown('not-a-date', 0, now)).toEqual({ onCooldown: false, readyAt: null });
  });
});
