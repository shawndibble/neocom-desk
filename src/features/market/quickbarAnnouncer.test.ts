import { describe, it, expect } from 'vitest';
import i18n from '@/i18n';
import { buildQuickbarAnnouncements } from './quickbarAnnouncer';

const items = [
  { typeId: 34, name: 'Tritanium', characterId: 1, position: 0 },
  { typeId: 35, name: 'Pyerite', characterId: 1, position: 1 },
  { typeId: 36, name: 'Mexallon', characterId: 1, position: 2 },
];
const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options) as string;
const announcements = buildQuickbarAnnouncements(items, t);
const rect = { id: 34 } as never;

describe('buildQuickbarAnnouncements', () => {
  it('names the item and its new position on drag over, with no bare typeId', () => {
    const text = announcements.onDragOver!({ active: { id: 34 }, over: { id: 35 } } as never);
    expect(text).toBe('Tritanium moved to position 2 of 3.');
  });

  it('names the item on pickup, drop and cancel', () => {
    expect(announcements.onDragStart!({ active: rect } as never)).toBe('Picked up Tritanium.');
    expect(announcements.onDragEnd!({ active: rect, over: { id: 36 } } as never)).toBe(
      'Tritanium dropped at position 3 of 3.'
    );
    expect(announcements.onDragCancel!({ active: rect } as never)).toMatch(/Tritanium/);
  });
});
