import { describe, expect, it } from 'vitest';
import {
  buildPushes,
  eveNotificationOccurrenceKey,
  MAX_TEXT_BYTES,
  SUMMARY_THRESHOLD,
} from './eveNotificationPush.js';
import type { EsiNotification } from './eveNotificationSelection.js';

const n = (id: number, text = 'x: 1'): EsiNotification => ({
  notification_id: id,
  type: 'WarDeclared',
  timestamp: '2026-10-14T13:00:00Z',
  text,
});

describe('buildPushes', () => {
  it('one raw push per notification up to the threshold', () => {
    const pushes = buildPushes(9, [n(1), n(2), n(3)]);
    expect(SUMMARY_THRESHOLD).toBe(3);
    expect(pushes).toHaveLength(3);
    expect(pushes[0]!.data).toMatchObject({
      characterId: '9',
      eventId: 'eveNotification',
      eveType: 'WarDeclared',
      notificationId: '1',
      notificationTimestamp: '2026-10-14T13:00:00Z',
      notificationText: 'x: 1',
      fireAt: String(Date.parse('2026-10-14T13:00:00Z')),
    });
    expect(pushes[0]!.collapseKey).toBeUndefined();
  });

  it('collapses more than the threshold into one summary with a collapse key', () => {
    const pushes = buildPushes(9, [n(1), n(2), n(3), n(4)]);
    expect(pushes).toHaveLength(1);
    expect(pushes[0]!.data.body).toBe('4 new EVE notifications');
    expect(pushes[0]!.collapseKey).toBe('eve-9');
  });

  it('caps the text and returns nothing for an empty list', () => {
    expect(buildPushes(9, [n(1, 'a'.repeat(5000))])[0]!.data.notificationText).toHaveLength(
      MAX_TEXT_BYTES
    );
    const cjk = buildPushes(9, [n(1, '字'.repeat(2000))])[0]!.data.notificationText;
    expect(Buffer.byteLength(cjk)).toBeLessThanOrEqual(MAX_TEXT_BYTES);
    expect(cjk).toMatch(/^字+$/);
    expect(buildPushes(9, [])).toEqual([]);
  });

  it('occurrence key matches the Foreground Poller derivation', () => {
    // Same literal pinned in src/engine/occurrenceKey.test.ts ("keys eveNotification").
    expect(eveNotificationOccurrenceKey(7, 321)).toBe('7:eveNotification:321');
  });
});
