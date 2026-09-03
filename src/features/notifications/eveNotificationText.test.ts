import { describe, it, expect } from 'vitest';
import { eveNotificationText } from './eveNotificationText';
import type { EveNotificationFire } from '@/engine/notificationDiffs';

function fire(overrides: Partial<EveNotificationFire> = {}): EveNotificationFire {
  return {
    eventId: 'eveNotification',
    characterId: 1,
    notificationId: 1,
    type: 'BillOutOfMoneyMsg',
    senderId: 1000132,
    senderType: 'corporation',
    text: 'amount: 12345\n',
    timestamp: '2026-09-03T00:00:00Z',
    ...overrides,
  };
}

const CHARACTER = { name: 'Test Pilot' };

describe('eveNotificationText', () => {
  it('renders a title and body for a known type', () => {
    const { title, body } = eveNotificationText(fire(), CHARACTER);
    expect(title).toBeTruthy();
    expect(body).toBeTruthy();
  });

  it("names the character, like every other event's notification body", () => {
    const { body } = eveNotificationText(fire(), CHARACTER);
    expect(body).toContain('Test Pilot');
  });

  it('renders generically for a type this catalog has never heard of, without throwing (AC2)', () => {
    expect(() =>
      eveNotificationText(fire({ type: 'SomeBrandNewMsgType6041' }), CHARACTER)
    ).not.toThrow();
    const { body } = eveNotificationText(fire({ type: 'SomeBrandNewMsgType6041' }), CHARACTER);
    expect(body).toContain('SomeBrandNewMsgType6041');
  });
});
