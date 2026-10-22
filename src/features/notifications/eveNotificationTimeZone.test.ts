import { describe, it, expect, afterAll } from 'vitest';
import { eveNotificationText } from './eveNotificationText';
import { renderEveNotification } from './eveNotificationRender';
import i18n from '@/i18n';
import { parseEveNotificationPayload, reinforcementExitMs } from '@/engine/eveNotificationPayload';
import { formatLocalDateTime } from '@/lib/localDate';
import type { EveNotificationFire } from '@/engine/notificationDiffs';

/**
 * Issue #4731: a notification's times follow the Time format setting. Every
 * instant here sits at 23:30Z, so a pilot on a zone ahead of UTC sees the next
 * day and the two clocks disagree on the date as well as the hour.
 */
const originalTz = process.env.TZ;
afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

// 2026-06-14T23:30:00Z as EVE ticks.
const TICKS_2330Z = '134259534000000000';
const CHARACTER = { name: 'Test Pilot' };

function fire(type: string, text: string): EveNotificationFire {
  return {
    eventId: 'eveNotification',
    characterId: 1,
    notificationId: 1,
    type,
    senderId: 1,
    senderType: 'corporation',
    text,
    timestamp: '2026-06-14T00:00:00Z',
  };
}

const CASES: { name: string; type: string; text: string; local: string; eve: string }[] = [
  {
    name: 'reinforcement exit (Orbital)',
    type: 'OrbitalReinforced',
    text: `planetID: 40121487\nreinforceExitTime: ${TICKS_2330Z}\n`,
    local: '2026-06-15, 11:30',
    eve: '2026-06-14, 23:30',
  },
  {
    name: 'moon extraction ready',
    type: 'MoonminingExtractionStarted',
    text: `moonID: 40161465\nstructureID: 1000000000001\nreadyTime: ${TICKS_2330Z}\n`,
    local: '2026-06-15, 11:30',
    eve: '2026-06-14, 23:30',
  },
  {
    name: 'bill due date',
    type: 'BillOutOfMoneyMsg',
    text: `dueDate: ${TICKS_2330Z}\n`,
    local: '2026-06-15',
    eve: '2026-06-14',
  },
  {
    name: 'corp bill due date',
    type: 'CorpAllBillMsg',
    text: `amount: 6000000\ndueDate: ${TICKS_2330Z}\n`,
    local: '2026-06-15',
    eve: '2026-06-14',
  },
];

describe('EVE Notification times follow the Time format', () => {
  for (const c of CASES) {
    it(`${c.name}: UTC when asked, host zone by default`, () => {
      process.env.TZ = 'Pacific/Auckland';
      const f = fire(c.type, c.text);
      const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);
      const byDefault = renderEveNotification(t, f, CHARACTER).body;
      const eve = renderEveNotification(t, f, CHARACTER, {}, 'UTC').body;
      expect(byDefault).toContain(c.local);
      expect(eve).toContain(c.eve);
      expect(eve).not.toContain(c.local);
      expect(eveNotificationText(f, CHARACTER).body).toContain(c.local);
    });
  }

  it('reinforcement exit (structure timeLeft) shifts with the clock', () => {
    process.env.TZ = 'Pacific/Auckland';
    const f = fire(
      'StructureLostShields',
      'structureID: 1000000000001\ntimeLeft: 1727805401093\nsolarsystemID: 1\n'
    );
    const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);
    const local = renderEveNotification(t, f, CHARACTER).body;
    const eve = renderEveNotification(t, f, CHARACTER, {}, 'UTC').body;
    expect(eve).not.toBe(local);
    // The exact UTC rendering of the instant the engine computes, not just its shape.
    const exitMs = reinforcementExitMs(f.timestamp, parseEveNotificationPayload(f.text));
    expect(exitMs).toBeDefined();
    expect(eve).toContain(formatLocalDateTime(new Date(exitMs!), 'UTC'));
    expect(local).toContain(formatLocalDateTime(new Date(exitMs!)));
  });
});
