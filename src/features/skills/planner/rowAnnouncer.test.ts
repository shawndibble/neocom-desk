import { describe, it, expect } from 'vitest';
import i18next from '@/i18n';
import type { MergedRow } from './queueRows';
import { buildRowAnnouncer } from './rowAnnouncer';

const nameFor = (id: number) => `Skill ${id}`;
// Real i18next `t`, like the component uses — this exercises the actual
// English strings, not a stand-in. dnd-kit's own event shape is `{ active,
// over }`, each a `{ id }` at minimum — the sub-shape this reads.
const t = (key: string, options?: Record<string, unknown>) => i18next.t(key, options);

const rows: MergedRow[] = [
  {
    kind: 'entry',
    id: 'e1',
    entry: { skillTypeID: 1, targetLevel: 4 },
    seconds: 0,
    cumulativeSeconds: 0,
    steps: [],
    stepIndices: [],
  },
  { kind: 'marker', id: 'm0', markerIndex: 0 },
  {
    kind: 'prereq',
    id: 'prereq-9-1',
    step: { skillTypeID: 9, level: 1, sp: 250, seconds: 50, cumulativeSeconds: 50 },
    stepIndex: 0,
  },
];

describe('buildRowAnnouncer (#1493)', () => {
  const { describeRow, announcements } = buildRowAnnouncer(rows, nameFor, t);

  it('names an entry row by skill and level', () => {
    expect(describeRow('e1')).toBe('Skill 1 IV');
  });

  it('names a marker row with the fixed marker label', () => {
    expect(describeRow('m0')).toBe('Remap marker');
  });

  it('names a prereq row by its own skill and level, same as an entry', () => {
    expect(describeRow('prereq-9-1')).toBe('Skill 9 I');
  });

  it('falls back to the raw id for a row that no longer exists, rather than throwing', () => {
    expect(describeRow('gone')).toBe('gone');
  });

  it('announces pickup by name', () => {
    expect(announcements.onDragStart({ active: { id: 'e1' } } as never)).toBe(
      'Picked up Skill 1 IV.'
    );
  });

  it('announces the dragged name and its 1-based position while dragging over a row', () => {
    expect(announcements.onDragOver({ active: { id: 'e1' }, over: { id: 'm0' } } as never)).toBe(
      'Skill 1 IV moved to position 2 of 3.'
    );
  });

  it('announces leaving a valid drop target without naming a position', () => {
    expect(announcements.onDragOver({ active: { id: 'e1' }, over: null } as never)).toBe(
      'Skill 1 IV is no longer over a valid position.'
    );
  });

  it('announces the drop position on end', () => {
    expect(announcements.onDragEnd({ active: { id: 'm0' }, over: { id: 'e1' } } as never)).toBe(
      'Remap marker dropped at position 1 of 3.'
    );
  });

  it('announces a cancelled drag the same way whether dropped with nowhere to land or explicitly cancelled', () => {
    expect(announcements.onDragEnd({ active: { id: 'e1' }, over: null } as never)).toBe(
      'Reordering cancelled. Skill 1 IV stayed at its original position.'
    );
    expect(announcements.onDragCancel({ active: { id: 'e1' } } as never)).toBe(
      'Reordering cancelled. Skill 1 IV stayed at its original position.'
    );
  });

  it('falls back to the last position for an id somehow not in the sortable list', () => {
    expect(
      announcements.onDragOver({ active: { id: 'e1' }, over: { id: 'unknown' } } as never)
    ).toBe('Skill 1 IV moved to position 3 of 3.');
  });
});
