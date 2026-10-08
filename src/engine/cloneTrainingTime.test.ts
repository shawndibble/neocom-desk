import { describe, it, expect } from 'vitest';
import { cloneTrainingTimes, type CloneTrainingInput } from './cloneTrainingTime';

const now = new Date('2026-10-08T12:00:00Z');
const base = { intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 };

const input = (over: Partial<CloneTrainingInput> = {}): CloneTrainingInput => ({
  queue: [{ skillTypeID: 1, remainingSp: 6000, primary: 'intelligence', secondary: 'memory' }],
  baseAttributes: base,
  clones: [
    { id: 'worn', implants: {} },
    { id: 'int5', implants: { intelligence: 5 } },
    { id: 'cha5', implants: { charisma: 5 } },
  ],
  wornCloneId: 'worn',
  now,
  ...over,
});
const by = (r: ReturnType<typeof cloneTrainingTimes>, id: string) =>
  r.find((c) => c.cloneId === id)!;

describe('cloneTrainingTimes', () => {
  it('is exact against the (primary + secondary/2) rate', () => {
    const r = cloneTrainingTimes(input());
    // worn: 20 + 10 = 30 SP/min -> 200 min
    expect(by(r, 'worn').totalSeconds).toBe(200 * 60);
    // int5: 25 + 10 = 35 SP/min
    expect(by(r, 'int5').totalSeconds).toBeCloseTo((6000 / 35) * 60);
    expect(by(r, 'int5').finish!.getTime()).toBeCloseTo(
      now.getTime() + by(r, 'int5').totalSeconds! * 1000,
      -1
    );
  });

  it('has zero delta for the worn clone and negative for a faster one', () => {
    const r = cloneTrainingTimes(input());
    expect(by(r, 'worn').deltaSeconds).toBe(0);
    expect(by(r, 'int5').deltaSeconds!).toBeLessThan(0);
  });

  it('matches the worn clone when implants touch only unused attributes', () => {
    const r = cloneTrainingTimes(input());
    expect(by(r, 'cha5').totalSeconds).toBe(by(r, 'worn').totalSeconds);
    expect(by(r, 'cha5').deltaSeconds).toBe(0);
  });

  it('evaluates the attribute pair per skill, not one scaled rate', () => {
    const r = cloneTrainingTimes(
      input({
        queue: [
          { skillTypeID: 1, remainingSp: 3000, primary: 'intelligence', secondary: 'memory' },
          { skillTypeID: 2, remainingSp: 3000, primary: 'charisma', secondary: 'willpower' },
        ],
      })
    );
    // int5: first 3000 @35, second 3000 @ 19+10=29
    expect(by(r, 'int5').totalSeconds).toBeCloseTo((3000 / 35 + 3000 / 29) * 60);
    // cha5: first 3000 @30, second @ 24+10=34
    expect(by(r, 'cha5').totalSeconds).toBeCloseTo((3000 / 30 + 3000 / 34) * 60);
  });

  it('finishes an empty queue now', () => {
    const r = cloneTrainingTimes(input({ queue: [] }));
    expect(by(r, 'int5').totalSeconds).toBe(0);
    expect(by(r, 'int5').finish).toEqual(now);
  });

  it('gives no finish for a paused queue', () => {
    const r = cloneTrainingTimes(input({ paused: true }));
    for (const c of r) {
      expect(c.finish).toBeNull();
      expect(c.totalSeconds).toBeNull();
      expect(c.deltaSeconds).toBeNull();
    }
  });

  it('halves every clone for Alpha, keeping the ordering', () => {
    const omega = cloneTrainingTimes(input());
    const alpha = cloneTrainingTimes(input({ cloneState: 'alpha' }));
    expect(by(alpha, 'worn').totalSeconds).toBeCloseTo(by(omega, 'worn').totalSeconds! * 2);
    expect(by(alpha, 'int5').totalSeconds!).toBeLessThan(by(alpha, 'worn').totalSeconds!);
  });

  describe('cooldown', () => {
    it('omits stayThenSwitch with no cooldown or one already over', () => {
      expect(by(cloneTrainingTimes(input()), 'int5').stayThenSwitch).toBeUndefined();
      const past = cloneTrainingTimes(input({ cooldownReadyAt: new Date(now.getTime() - 1000) }));
      expect(by(past, 'int5').stayThenSwitch).toBeUndefined();
    });

    it('splits mid-skill: stay on the worn clone until ready, then switch', () => {
      const readyAt = new Date(now.getTime() + 60 * 60 * 1000); // 60 min
      const r = cloneTrainingTimes(input({ cooldownReadyAt: readyAt }));
      // 60 min @30 = 1800 SP, remaining 4200 @35
      const expected = 3600 + (4200 / 35) * 60;
      expect(by(r, 'int5').stayThenSwitch!.finish!.getTime()).toBeCloseTo(
        now.getTime() + expected * 1000,
        -1
      );
      expect(by(r, 'int5').stayThenSwitch!.deltaSeconds).toBeCloseTo(expected - 200 * 60);
      expect(by(r, 'worn').stayThenSwitch!.deltaSeconds).toBe(0);
    });

    it('equals staying when the queue ends before the cooldown', () => {
      const readyAt = new Date(now.getTime() + 1000 * 60 * 60 * 24);
      const r = cloneTrainingTimes(input({ cooldownReadyAt: readyAt }));
      expect(by(r, 'int5').stayThenSwitch!.finish).toEqual(by(r, 'worn').finish);
    });

    it('switches rate for later skills when the boundary falls on a skill edge', () => {
      const r = cloneTrainingTimes(
        input({
          queue: [
            { skillTypeID: 1, remainingSp: 1800, primary: 'intelligence', secondary: 'memory' },
            { skillTypeID: 2, remainingSp: 3000, primary: 'intelligence', secondary: 'memory' },
          ],
          cooldownReadyAt: new Date(now.getTime() + 60 * 60 * 1000),
        })
      );
      expect(by(r, 'int5').stayThenSwitch!.finish!.getTime()).toBeCloseTo(
        now.getTime() + (3600 + (3000 / 35) * 60) * 1000,
        -1
      );
    });
  });
});

describe('cloneTrainingTimes worn clone', () => {
  it('throws when the worn clone is not among the clones', () => {
    expect(() => cloneTrainingTimes(input({ wornCloneId: 'nope' }))).toThrow(RangeError);
  });
});
