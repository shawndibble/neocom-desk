import { describe, expect, it } from 'vitest';
import { selectPushable, type EsiNotification } from './eveNotificationSelection.js';

const ENABLED_AT = Date.parse('2026-10-14T12:00:00Z');
const n = (id: number, type: string, timestamp: string): EsiNotification => ({
  notification_id: id,
  type,
  timestamp,
});
const AFTER = '2026-10-14T13:00:00Z';
const BEFORE = '2026-10-14T11:00:00Z';
const phone = { deviceId: 'phone', eveTypes: ['StructureUnderAttack', 'WarDeclared'] };
const laptop = { deviceId: 'laptop', eveTypes: ['WarDeclared'] };

const base = {
  highWaterId: 10,
  enabledAt: ENABLED_AT,
  seenTypes: ['StructureUnderAttack', 'WarDeclared'],
  devices: [phone, laptop],
};

describe('selectPushable', () => {
  it('pushes new, post-enable, enabled types to each matching device', () => {
    const feed = [
      n(11, 'StructureUnderAttack', AFTER),
      n(12, 'WarDeclared', AFTER),
      n(13, 'KillReportVictim', AFTER),
    ];
    const out = selectPushable({
      ...base,
      seenTypes: [...base.seenTypes, 'KillReportVictim'],
      notifications: feed,
    });
    expect(out.byDevice.get('phone')?.map((x) => x.notification_id)).toEqual([11, 12]);
    expect(out.byDevice.get('laptop')?.map((x) => x.notification_id)).toEqual([12]);
    expect(out.highWaterId).toBe(13);
  });

  it('skips ids at or below the high-water mark', () => {
    const out = selectPushable({ ...base, notifications: [n(10, 'WarDeclared', AFTER)] });
    expect(out.byDevice.size).toBe(0);
    expect(out.highWaterId).toBe(10);
  });

  it('never replays history from before enabledAt, but still records its types', () => {
    const out = selectPushable({
      ...base,
      highWaterId: null,
      seenTypes: [],
      notifications: [n(1, 'WarDeclared', BEFORE), n(2, 'WarDeclared', BEFORE)],
    });
    expect(out.byDevice.size).toBe(0);
    expect(out.seenTypes).toEqual(['WarDeclared']);
    expect(out.highWaterId).toBe(2);
  });

  it('does not push the first occurrence of a never-seen type, but records it', () => {
    const out = selectPushable({
      ...base,
      seenTypes: [],
      notifications: [n(11, 'WarDeclared', AFTER), n(12, 'WarDeclared', AFTER)],
    });
    expect(out.byDevice.get('laptop')?.map((x) => x.notification_id)).toEqual([12]);
    expect(out.seenTypes).toEqual(['WarDeclared']);
  });

  it('unsorted input is handled oldest first', () => {
    const out = selectPushable({
      ...base,
      notifications: [n(12, 'WarDeclared', AFTER), n(11, 'WarDeclared', AFTER)],
    });
    expect(out.byDevice.get('laptop')?.map((x) => x.notification_id)).toEqual([11, 12]);
  });

  it('a device with the type disabled gets nothing; empty feed keeps state', () => {
    const none = selectPushable({
      ...base,
      devices: [{ deviceId: 'x', eveTypes: [] }],
      notifications: [n(11, 'WarDeclared', AFTER)],
    });
    expect(none.byDevice.size).toBe(0);
    const empty = selectPushable({ ...base, notifications: [] });
    expect(empty.highWaterId).toBe(10);
    expect(empty.seenTypes).toEqual(['StructureUnderAttack', 'WarDeclared']);
  });

  it('skips an unparseable timestamp', () => {
    const out = selectPushable({ ...base, notifications: [n(11, 'WarDeclared', 'nope')] });
    expect(out.byDevice.size).toBe(0);
  });
});
