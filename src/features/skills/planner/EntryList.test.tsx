import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { EntryList } from './EntryList';
import { entryId } from './reorder';
import type { MergedRow } from './queueRows';
import type { PlanEntry } from '@/engine/types';

const entry = (skillTypeID: number, targetLevel = 1): PlanEntry => ({ skillTypeID, targetLevel });

function entryRow(skillTypeID: number, stepIndices: number[]): MergedRow {
  const planEntry = entry(skillTypeID);
  return {
    kind: 'entry',
    id: entryId(planEntry),
    entry: planEntry,
    seconds: 100 * stepIndices.length,
    cumulativeSeconds: 100 * (stepIndices[stepIndices.length - 1] ?? -1) + 100,
    stepIndices,
  };
}

const nameFor = (id: number) => `Skill ${id}`;

const noop = () => {};

describe('EntryList Booster marks', () => {
  it('marks only the entry row owning the boosted step', () => {
    const rows = [entryRow(1, [0]), entryRow(2, [1])];
    render(
      <EntryList
        rows={rows}
        bandsAt={new Map()}
        nameFor={nameFor}
        boostedSteps={new Set([0])}
        onReorder={noop}
        onRemove={noop}
        onRemoveMarker={noop}
        onSetPriority={noop}
      />
    );
    const marks = screen.getAllByRole('img', { name: /booster speeds this skill up/i });
    expect(marks).toHaveLength(1);
    expect(screen.getByText(/Skill 1/).closest('li')).toContainElement(marks[0]);
  });

  it('marks nothing when no Booster is active', () => {
    const rows = [entryRow(1, [0]), entryRow(2, [1])];
    render(
      <EntryList
        rows={rows}
        bandsAt={new Map()}
        nameFor={nameFor}
        onReorder={noop}
        onRemove={noop}
        onRemoveMarker={noop}
        onSetPriority={noop}
      />
    );
    expect(
      screen.queryByRole('img', { name: /booster speeds this skill up/i })
    ).not.toBeInTheDocument();
  });

  it('an entry spanning several boosted step indices still shows exactly one mark', () => {
    const rows = [entryRow(1, [0, 1, 2])];
    render(
      <EntryList
        rows={rows}
        bandsAt={new Map()}
        nameFor={nameFor}
        boostedSteps={new Set([1, 2])}
        onReorder={noop}
        onRemove={noop}
        onRemoveMarker={noop}
        onSetPriority={noop}
      />
    );
    expect(screen.getAllByRole('img', { name: /booster speeds this skill up/i })).toHaveLength(1);
  });
});

describe('EntryList prereq rows', () => {
  it('renders a dimmed, non-interactive prereq row ahead of the entry it was inserted for', () => {
    const rows: MergedRow[] = [
      {
        kind: 'prereq',
        id: 'prereq-9-1',
        step: { skillTypeID: 9, level: 1, sp: 250, seconds: 50, cumulativeSeconds: 50 },
        stepIndex: 0,
      },
      entryRow(1, [1]),
    ];
    render(
      <EntryList
        rows={rows}
        bandsAt={new Map()}
        nameFor={nameFor}
        onReorder={noop}
        onRemove={noop}
        onRemoveMarker={noop}
        onSetPriority={noop}
      />
    );
    expect(screen.getByText(/prereq/i)).toBeInTheDocument();
    // No drag handle (reorder label) or priority control for the prereq row's skill.
    expect(screen.queryByRole('button', { name: /reorder skill 9/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reorder skill 1/i })).toBeInTheDocument();
  });
});

describe('EntryList empty state', () => {
  it('shows the empty-entries message when there are no rows', () => {
    render(
      <EntryList
        rows={[]}
        bandsAt={new Map()}
        nameFor={nameFor}
        onReorder={noop}
        onRemove={noop}
        onRemoveMarker={noop}
        onSetPriority={noop}
      />
    );
    expect(screen.getByText('No entries yet. Add a skill below.')).toBeInTheDocument();
  });
});
