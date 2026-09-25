import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { EntryList } from './EntryList';
import { entryId } from './reorder';
import { markerRowId } from './markers';
import { DEFAULT_COLUMN_VISIBILITY, type ColumnVisibility } from './columnPreference';
import type { MergedRow } from './queueRows';
import type { PlanEntry } from '@/engine/types';
import { formatLocalDate } from '@/lib/localDate';

const entry = (skillTypeID: number, targetLevel = 1): PlanEntry => ({ skillTypeID, targetLevel });

/**
 * One own step per stepIndex, levels running 1..n so the row's target level
 * matches its last step. `levels` overrides that for the already-trained case,
 * where an entry's first queued level is above I.
 */
function entryRow(skillTypeID: number, stepIndices: number[], levels?: number[]): MergedRow {
  const stepLevels = levels ?? stepIndices.map((_, i) => i + 1);
  const planEntry = entry(skillTypeID, stepLevels[stepLevels.length - 1] ?? 1);
  return {
    kind: 'entry',
    id: entryId(planEntry),
    entry: planEntry,
    seconds: 100 * stepIndices.length,
    cumulativeSeconds: 100 * (stepIndices[stepIndices.length - 1] ?? -1) + 100,
    steps: stepIndices.map((stepIndex, i) => ({
      skillTypeID,
      level: stepLevels[i],
      sp: 0,
      seconds: 100,
      cumulativeSeconds: 100 * stepIndex + 100,
    })),
    stepIndices,
  };
}

const nameFor = (id: number) => `Skill ${id}`;
const attributesFor = () => undefined;

const noop = () => {};

const defaultProps = {
  nameFor,
  attributesFor,
  columns: DEFAULT_COLUMN_VISIBILITY,
  onReorder: noop,
  onRemove: noop,
  onRemoveMarker: noop,
  onEditMarker: noop,
  onSetPriority: noop,
  onPromotePrereq: noop,
  milestoneStatusFor: () => undefined,
  onAddMilestone: noop,
  onRenameMilestone: noop,
  onRemoveMilestone: noop,
};

/** jsdom's default `window.matchMedia` never matches, so EntryList renders its narrow (below-`md`) layout by default; mock it to exercise the desktop layout. */
function mockDesktop(matches: boolean): () => void {
  const original = window.matchMedia;
  window.matchMedia = (media: string) =>
    ({
      media,
      matches,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  return () => {
    window.matchMedia = original;
  };
}

describe('EntryList step timeline renders in the viewer local timezone (#207)', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('renders the previous local day for a start instant just after UTC midnight', () => {
    process.env.TZ = 'America/Los_Angeles';
    const rows = [entryRow(1, [0])];
    render(
      <EntryList
        rows={rows}
        bandsAt={new Map()}
        startDate={new Date('2026-09-01T00:00:00Z')}
        {...defaultProps}
      />
    );
    expect(screen.getByText(/2026-08-31/)).toBeInTheDocument();
  });
});

describe('EntryList Booster marks', () => {
  it('marks only the entry row owning the boosted step', () => {
    const rows = [entryRow(1, [0]), entryRow(2, [1])];
    render(
      <EntryList rows={rows} bandsAt={new Map()} boostedSteps={new Set([0])} {...defaultProps} />
    );
    const marks = screen.getAllByRole('img', { name: /booster speeds this skill up/i });
    expect(marks).toHaveLength(1);
    // Anchored: an unanchored /Skill 1/ also matches the new "Move Skill 1
    // up/down" tooltip text that used to sit elsewhere in the row.
    expect(screen.getByText(/^Skill 1\b/).closest('li')).toContainElement(marks[0]);
  });

  it('marks nothing when no Booster is active', () => {
    const rows = [entryRow(1, [0]), entryRow(2, [1])];
    render(<EntryList rows={rows} bandsAt={new Map()} {...defaultProps} />);
    expect(
      screen.queryByRole('img', { name: /booster speeds this skill up/i })
    ).not.toBeInTheDocument();
  });

  it('an entry spanning several boosted step indices still shows exactly one mark', () => {
    const rows = [entryRow(1, [0, 1, 2])];
    render(
      <EntryList rows={rows} bandsAt={new Map()} boostedSteps={new Set([1, 2])} {...defaultProps} />
    );
    expect(screen.getAllByRole('img', { name: /booster speeds this skill up/i })).toHaveLength(1);
  });
});

describe('EntryList prereq rows', () => {
  const prereqRows: MergedRow[] = [
    {
      kind: 'prereq',
      id: 'prereq-9-1',
      step: { skillTypeID: 9, level: 1, sp: 250, seconds: 50, cumulativeSeconds: 50 },
      stepIndex: 0,
    },
    entryRow(1, [1]),
  ];

  it('renders a dimmed prereq row ahead of the entry it was inserted for', () => {
    render(<EntryList rows={prereqRows} bandsAt={new Map()} {...defaultProps} />);
    expect(screen.getByText(/prereq/i)).toBeInTheDocument();
    // Still no priority control — a prereq's priority is inherited (#27), not set.
    expect(screen.queryByLabelText(/priority for skill 9/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reorder skill 1/i })).toBeInTheDocument();
  });

  it('offers a drag handle, because dragging a prereq row promotes it into an entry', () => {
    render(<EntryList rows={prereqRows} bandsAt={new Map()} {...defaultProps} />);
    expect(
      screen.getByRole('button', { name: /drag skill 9 i into the plan/i })
    ).toBeInTheDocument();
  });

  it('offers the same promotion without a drag, for anyone not dragging', () => {
    const promoted: string[] = [];
    render(
      <EntryList
        rows={prereqRows}
        bandsAt={new Map()}
        {...defaultProps}
        onPromotePrereq={(rowId) => promoted.push(rowId)}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /add skill 9 i to the plan/i }));
    expect(promoted).toEqual(['prereq-9-1']);
  });

  it('keeps a prereq row’s level numeral out of the truncating name span (#1716)', () => {
    render(<EntryList rows={prereqRows} bandsAt={new Map()} {...defaultProps} />);
    const row = screen.getByText(/^Skill 9\b/).closest('li') as HTMLElement;
    const numeral = within(row).getByText('I', { exact: true });
    expect(numeral.parentElement).toHaveClass('shrink-0');
    const nameEl = within(row).getByText('Skill 9', { exact: true });
    expect(nameEl).toHaveClass('truncate');
    expect(nameEl).not.toContainElement(numeral);
  });
});

describe('EntryList drag handles mention keyboard reordering (#408)', () => {
  it("an entry row's drag handle names the keyboard alternative", () => {
    render(<EntryList rows={[entryRow(1, [0])]} bandsAt={new Map()} {...defaultProps} />);
    expect(
      screen.getByRole('button', { name: /reorder skill 1 i — press space then arrow keys/i })
    ).toBeInTheDocument();
  });

  it("a marker row's drag handle names the keyboard alternative", () => {
    render(
      <EntryList
        rows={[{ kind: 'marker', id: markerRowId(0), markerIndex: 0 }]}
        bandsAt={new Map()}
        {...defaultProps}
      />
    );
    expect(
      screen.getByRole('button', { name: /reorder remap marker — press space then arrow keys/i })
    ).toBeInTheDocument();
  });
});

describe('EntryList empty state', () => {
  it('shows the empty-entries message when there are no rows', () => {
    render(<EntryList rows={[]} bandsAt={new Map()} {...defaultProps} />);
    expect(screen.getByText('No entries yet. Add a skill below.')).toBeInTheDocument();
  });
});

describe('EntryList column visibility', () => {
  it('hides the attribute badge, priority control, per-level and cumulative time when disabled', () => {
    const rows = [entryRow(1, [0])];
    const columns: ColumnVisibility = {
      attributePair: false,
      priority: false,
      perLevelTime: false,
      cumulativeTime: false,
    };
    render(
      <EntryList
        rows={rows}
        bandsAt={new Map()}
        {...defaultProps}
        attributesFor={() => ({ primary: 'perception', secondary: 'willpower' })}
        columns={columns}
      />
    );
    expect(screen.queryByText('PER/WIL')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/priority for/i)).not.toBeInTheDocument();
    expect(screen.queryByText('1m')).not.toBeInTheDocument();
    expect(screen.queryByText('10m')).not.toBeInTheDocument();
    // Always-present parts remain regardless of the column toggle.
    expect(screen.getByRole('button', { name: /reorder skill 1/i })).toBeInTheDocument();
    expect(screen.getByText(/^Skill 1\b/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove skill 1/i })).toBeInTheDocument();
  });

  it('shows the attribute badge, priority control, per-level and cumulative time when enabled', () => {
    const rows = [entryRow(1, [0])];
    render(
      <EntryList
        rows={rows}
        bandsAt={new Map()}
        {...defaultProps}
        attributesFor={() => ({ primary: 'perception', secondary: 'willpower' })}
        columns={{ ...DEFAULT_COLUMN_VISIBILITY, priority: true }}
      />
    );
    expect(screen.getByText('PER/WIL')).toBeInTheDocument();
    expect(screen.getByLabelText(/priority for/i)).toBeInTheDocument();
  });

  it('leaves priority off by default — it is an editing control, not a readout', () => {
    render(<EntryList rows={[entryRow(1, [0])]} bandsAt={new Map()} {...defaultProps} />);
    expect(screen.queryByLabelText(/priority for/i)).not.toBeInTheDocument();
  });

  it('sets a priority from the pill menu instead of a full-width select', async () => {
    const user = userEvent.setup();
    const calls: Array<[number, string]> = [];
    render(
      <EntryList
        rows={[entryRow(1, [0])]}
        bandsAt={new Map()}
        {...defaultProps}
        columns={{ ...DEFAULT_COLUMN_VISIBILITY, priority: true }}
        onSetPriority={(skillTypeID, priority) => calls.push([skillTypeID, priority])}
      />
    );

    await user.click(screen.getByLabelText(/priority for skill 1/i));
    await user.click(screen.getByRole('menuitem', { name: 'High' }));

    expect(calls).toEqual([[1, 'high']]);
  });
});

describe('EntryList narrow vs desktop layout (#114)', () => {
  it('folds a row to two lines below the desktop breakpoint, with every optional value labelled on line two', () => {
    const restore = mockDesktop(false);
    try {
      const rows = [entryRow(1, [5])];
      render(
        <EntryList
          rows={rows}
          bandsAt={new Map()}
          {...defaultProps}
          attributesFor={() => ({ primary: 'perception', secondary: 'willpower' })}
          columns={{ ...DEFAULT_COLUMN_VISIBILITY, priority: true }}
        />
      );
      // Line 1 is the name and its remove button only: the finish date used to
      // ride up here and squeeze the name.
      const nameLine = screen.getByText(/^Skill 1\b/).closest('div');
      expect(nameLine).not.toBeNull();
      expect(within(nameLine as HTMLElement).queryByText('10m')).toBeNull();
      // Line 2: attribute badge, priority pill, and both times, each labelled
      // in place rather than hidden behind a tooltip the user has to find.
      expect(screen.getByText('PER/WIL')).toBeInTheDocument();
      expect(screen.getByLabelText(/priority for skill 1/i)).toBeInTheDocument();
      // Both labels ride the values themselves below `md`, since the desktop
      // column headers they'd otherwise sit under are not rendered here.
      expect(screen.getByText('Takes')).toBeInTheDocument();
      expect(screen.getByText('1m')).toBeInTheDocument();
      expect(screen.getByText('Done by')).toBeInTheDocument();
      expect(screen.getByText('10m')).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('collapses to a single line when every optional column is off', () => {
    const restore = mockDesktop(false);
    try {
      render(
        <EntryList
          rows={[entryRow(1, [5])]}
          bandsAt={new Map()}
          {...defaultProps}
          columns={{
            attributePair: false,
            priority: false,
            perLevelTime: false,
            cumulativeTime: false,
          }}
        />
      );
      expect(screen.queryByText('1m')).not.toBeInTheDocument();
      expect(screen.queryByText('10m')).not.toBeInTheDocument();
      expect(screen.getByText(/^Skill 1\b/)).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('disabling the finish date removes it from the narrow row', () => {
    const restore = mockDesktop(false);
    try {
      const rows = [entryRow(1, [5])];
      render(
        <EntryList
          rows={rows}
          bandsAt={new Map()}
          {...defaultProps}
          columns={{ ...DEFAULT_COLUMN_VISIBILITY, cumulativeTime: false }}
        />
      );
      expect(screen.queryByText('10m')).not.toBeInTheDocument();
      expect(screen.getByText('1m')).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  /**
   * #1106: the pill was a bare `px-1` button around 11px text — roughly a
   * 17px tap target on the one layout where a thumb is doing the tapping.
   * The chip keeps that size; the trigger around it grows. Asserted on the
   * class here because jsdom has no layout; the rendered box is asserted in
   * `e2e/skillPlanEditorNarrow.spec.ts`.
   */
  it('pads the priority pill out to the sm touch tier below the desktop breakpoint', () => {
    const restore = mockDesktop(false);
    try {
      render(
        <EntryList
          rows={[entryRow(1, [5])]}
          bandsAt={new Map()}
          {...defaultProps}
          columns={{ ...DEFAULT_COLUMN_VISIBILITY, priority: true }}
        />
      );
      const pill = screen.getByLabelText(/priority for skill 1/i);
      expect(pill).toHaveClass('h-9');
      // The chip itself is untouched: same border and padding as the
      // attribute badge it sits beside.
      expect(pill.querySelector('span')).toHaveClass('px-1');
    } finally {
      restore();
    }
  });

  it('leaves the desktop pill unpadded, so it stays flush with the sm controls in its row', () => {
    const restore = mockDesktop(true);
    try {
      render(
        <EntryList
          rows={[entryRow(1, [5])]}
          bandsAt={new Map()}
          {...defaultProps}
          columns={{ ...DEFAULT_COLUMN_VISIBILITY, priority: true }}
        />
      );
      expect(screen.getByLabelText(/priority for skill 1/i)).not.toHaveClass('h-9');
    } finally {
      restore();
    }
  });

  it('shows a single-line row under Takes/Done by headers on desktop', () => {
    const restore = mockDesktop(true);
    try {
      const rows = [entryRow(1, [5])];
      render(<EntryList rows={rows} bandsAt={new Map()} {...defaultProps} />);
      expect(screen.getByText('Takes')).toBeInTheDocument();
      expect(screen.getByText('Done by')).toBeInTheDocument();
      expect(screen.getByText('1m')).toBeInTheDocument();
      expect(screen.getByText('10m')).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  // The desktop header above these columns is visual only, so each cell
  // carries its own `sr-only` label — the mobile meta line already showed
  // this inline (`MetaValue`'s "Takes 1m" pairing).
  it("labels each entry row's Takes/Done by cell for screen readers, on desktop only", () => {
    const restore = mockDesktop(true);
    try {
      render(<EntryList rows={[entryRow(1, [5])]} bandsAt={new Map()} {...defaultProps} />);
      expect(screen.getByText('Takes:')).toBeInTheDocument();
      expect(screen.getByText('Done by:')).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it("labels a prereq row's cells too, and drops the sr-only labels on the narrow layout (already labelled inline)", () => {
    const rows: MergedRow[] = [
      {
        kind: 'prereq',
        id: 'prereq-9-1',
        step: { skillTypeID: 9, level: 1, sp: 250, seconds: 50, cumulativeSeconds: 50 },
        stepIndex: 0,
      },
      entryRow(1, [1]),
    ];

    let restore = mockDesktop(true);
    try {
      const { unmount } = render(<EntryList rows={rows} bandsAt={new Map()} {...defaultProps} />);
      // One label per row: the prereq row's own cell, and the entry row's.
      expect(screen.getAllByText('Takes:')).toHaveLength(2);
      expect(screen.getAllByText('Done by:')).toHaveLength(2);
      unmount();
    } finally {
      restore();
    }

    restore = mockDesktop(false);
    try {
      render(<EntryList rows={rows} bandsAt={new Map()} {...defaultProps} />);
      expect(screen.queryByText('Takes:')).not.toBeInTheDocument();
      expect(screen.queryByText('Done by:')).not.toBeInTheDocument();
    } finally {
      restore();
    }
  });
});

describe('EntryList finish date (#20)', () => {
  const startDate = new Date('2026-01-01T00:00:00Z');

  it('renders the running total as the date that step finishes on', () => {
    const restore = mockDesktop(true);
    try {
      // 600 cumulative seconds past a start date one full day earlier than the
      // step ahead of it, so the two rows land on different calendar dates.
      const rows = [entryRow(1, [0]), entryRow(2, [864])];
      render(<EntryList rows={rows} bandsAt={new Map()} {...defaultProps} startDate={startDate} />);
      expect(
        screen.getByText(formatLocalDate(new Date('2026-01-01T00:01:40Z')))
      ).toBeInTheDocument();
      expect(
        screen.getByText(formatLocalDate(new Date('2026-01-02T00:00:20Z')))
      ).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('falls back to the running total as a duration when no start date is known', () => {
    const restore = mockDesktop(true);
    try {
      render(<EntryList rows={[entryRow(1, [5])]} bandsAt={new Map()} {...defaultProps} />);
      expect(screen.getByText('10m')).toBeInTheDocument();
    } finally {
      restore();
    }
  });
});

describe('EntryList reorder affordance (#1493)', () => {
  // See MoveMenu's own docstring for why this is a menu, not the twin
  // Up/Down buttons #223 shipped and reverted.
  const rows: MergedRow[] = [
    entryRow(1, [0]),
    { kind: 'marker', id: markerRowId(0), markerIndex: 0 },
    entryRow(2, [1]),
  ];

  it('offers a Move menu beside the drag handle, at every width', () => {
    for (const desktop of [false, true]) {
      const restore = mockDesktop(desktop);
      try {
        const { unmount } = render(<EntryList rows={rows} bandsAt={new Map()} {...defaultProps} />);

        expect(screen.getByRole('button', { name: /reorder skill 1 i/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Move Skill 1 I' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Move Remap marker' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Move Skill 2 I' })).toBeInTheDocument();

        unmount();
      } finally {
        restore();
      }
    }
  });

  it('moves an entry down onto the following row, the same drop a drag onto it would make', async () => {
    const user = userEvent.setup();
    const calls: Array<[string, string]> = [];
    render(
      <EntryList
        rows={rows}
        bandsAt={new Map()}
        {...defaultProps}
        onReorder={(activeId, overId) => calls.push([activeId, overId])}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Move Skill 1 I' }));
    await user.click(screen.getByRole('menuitem', { name: 'Move down' }));

    expect(calls).toEqual([[entryId(entry(1, 1)), markerRowId(0)]]);
  });

  it('moves a marker up onto the preceding row', async () => {
    const user = userEvent.setup();
    const calls: Array<[string, string]> = [];
    render(
      <EntryList
        rows={rows}
        bandsAt={new Map()}
        {...defaultProps}
        onReorder={(activeId, overId) => calls.push([activeId, overId])}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Move Remap marker' }));
    await user.click(screen.getByRole('menuitem', { name: 'Move up' }));

    expect(calls).toEqual([[markerRowId(0), entryId(entry(1, 1))]]);
  });

  it('disables Move up on the first row and Move down on the last, rather than moving nowhere', async () => {
    const user = userEvent.setup();
    render(<EntryList rows={rows} bandsAt={new Map()} {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: 'Move Skill 1 I' }));
    expect(screen.getByRole('menuitem', { name: 'Move up' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Move Skill 2 I' }));
    expect(screen.getByRole('menuitem', { name: 'Move down' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });
});

describe('EntryList drag announcements (#1493)', () => {
  // Dynamic per-drag naming/position is buildRowAnnouncer's job, unit-tested
  // in rowAnnouncer.test.ts — jsdom can't drive an actual drag. This only
  // checks the wiring reaches dnd-kit's `screenReaderInstructions`.
  it('renders the translated keyboard instructions dnd-kit exposes up front', () => {
    const rows: MergedRow[] = [
      entryRow(1, [0]),
      { kind: 'marker', id: markerRowId(0), markerIndex: 0 },
    ];
    render(<EntryList rows={rows} bandsAt={new Map()} {...defaultProps} />);
    expect(screen.getByText(/to pick up an entry or remap marker/i)).toBeInTheDocument();
  });
});

describe('EntryList marker row attributes', () => {
  const rows: MergedRow[] = [
    entryRow(1, [0]),
    { kind: 'marker', id: markerRowId(0), markerIndex: 0 },
  ];

  it('shows the plain divider when no target attributes are known for this marker', () => {
    render(<EntryList rows={rows} bandsAt={new Map()} {...defaultProps} />);
    expect(screen.getByText('Remap marker')).toBeInTheDocument();
    expect(screen.queryByText(/PER 27/)).not.toBeInTheDocument();
  });

  it('shows the marker\'s target attribute spread instead of the divider once known, and drops the "Remap marker" label entirely', () => {
    const attributes = {
      intelligence: 17,
      memory: 17,
      perception: 27,
      willpower: 21,
      charisma: 17,
    };
    render(
      <EntryList
        rows={rows}
        bandsAt={new Map()}
        {...defaultProps}
        markerAttributesFor={(markerIndex) => (markerIndex === 0 ? attributes : undefined)}
      />
    );
    expect(screen.getByText('PER 27 / WIL 21 / INT 17 / MEM 17 / CHA 17')).toBeInTheDocument();
    // The numbers already say what the row is; repeating the generic label
    // next to them would just be clutter — it stays only for a marker with
    // nothing known yet (the sibling test above).
    expect(screen.queryByText('Remap marker')).not.toBeInTheDocument();
  });

  it("adds the plan's implant bonuses, so the spread reads as the in-game remap screen does", () => {
    const attributes = {
      intelligence: 17,
      memory: 17,
      perception: 27,
      willpower: 21,
      charisma: 17,
    };
    render(
      <EntryList
        rows={rows}
        bandsAt={new Map()}
        {...defaultProps}
        markerAttributesFor={() => attributes}
        markerImplants={{ perception: 4, willpower: 4, intelligence: 5 }}
      />
    );
    expect(screen.getByText('PER 31 / WIL 25 / INT 22 / MEM 17 / CHA 17')).toBeInTheDocument();
  });

  it('opens the manual attribute editor when the marker row is clicked, whichever text it shows', async () => {
    const user = userEvent.setup();
    const onEditMarker = vi.fn();
    const attributes = {
      intelligence: 17,
      memory: 17,
      perception: 27,
      willpower: 21,
      charisma: 17,
    };

    const { unmount } = render(
      <EntryList rows={rows} bandsAt={new Map()} {...defaultProps} onEditMarker={onEditMarker} />
    );
    await user.click(screen.getByRole('button', { name: 'Remap marker' }));
    expect(onEditMarker).toHaveBeenCalledWith(0);
    unmount();

    onEditMarker.mockClear();
    render(
      <EntryList
        rows={rows}
        bandsAt={new Map()}
        {...defaultProps}
        markerAttributesFor={() => attributes}
        onEditMarker={onEditMarker}
      />
    );
    await user.click(
      screen.getByRole('button', { name: 'PER 27 / WIL 21 / INT 17 / MEM 17 / CHA 17' })
    );
    expect(onEditMarker).toHaveBeenCalledWith(0);
  });
});

describe('EntryList band headers (#115)', () => {
  it('renders a priority band header', () => {
    const rows = [entryRow(1, [0])];
    render(
      <EntryList
        rows={rows}
        bandsAt={new Map([[rows[0].id, { kind: 'priority', priority: 'high' }]])}
        {...defaultProps}
      />
    );
    expect(screen.getByText('High priority')).toBeInTheDocument();
  });

  it('renders an attribute-pair band header', () => {
    const rows = [entryRow(1, [0])];
    render(
      <EntryList
        rows={rows}
        bandsAt={
          new Map([
            [rows[0].id, { kind: 'attributePair', primary: 'perception', secondary: 'willpower' }],
          ])
        }
        {...defaultProps}
      />
    );
    expect(screen.getByText('PER/WIL attributes')).toBeInTheDocument();
  });
});

describe('EntryList one row per level', () => {
  // #254 shipped a caret here: a "Caldari Carrier V" entry queued several
  // levels behind one aggregated time, so the row disclosed them. A plan now
  // holds one entry per level (reorder.ts), so each level is its own row —
  // which is what lets the user drag another skill between two of them — and
  // there is nothing left for a row to disclose.
  for (const desktop of [false, true]) {
    const width = desktop ? 'desktop' : 'narrow';

    it(`labels a row with its own single level, and offers no toggle (${width})`, () => {
      const restore = mockDesktop(desktop);
      try {
        render(<EntryList rows={[entryRow(1, [0], [4])]} bandsAt={new Map()} {...defaultProps} />);
        // Level numeral now lives in its own shrink-0 span, sibling to the
        // truncating name span (#1716) — not one direct text-node run
        // anymore, so match name and numeral separately within the row.
        const row = screen.getByText(/^Skill 1\b/).closest('li');
        expect(within(row as HTMLElement).getByText('IV', { exact: true })).toBeInTheDocument();
        // The retired per-level disclosure (#254) is gone outright, not just
        // hidden — unlike the row's own legitimate menus (priority, Plan
        // Milestone), there is no "levels trained" list left for anything to
        // disclose.
        expect(screen.queryByRole('list', { name: /levels trained/i })).toBeNull();
      } finally {
        restore();
      }
    });
  }

  it("shows a skill's two levels as two separate rows", () => {
    render(
      <EntryList
        rows={[entryRow(1, [0], [4]), entryRow(1, [1], [5])]}
        bandsAt={new Map()}
        {...defaultProps}
      />
    );
    const rows = screen.getAllByText(/^Skill 1\b/).map((el) => el.closest('li') as HTMLElement);
    expect(within(rows[0]).getByText('IV', { exact: true })).toBeInTheDocument();
    expect(within(rows[1]).getByText('V', { exact: true })).toBeInTheDocument();
  });

  it('keeps the level numeral out of the truncating name span (#1716)', () => {
    render(<EntryList rows={[entryRow(1, [0], [4])]} bandsAt={new Map()} {...defaultProps} />);
    const numeral = screen.getByText('IV', { exact: true });
    expect(numeral.parentElement).toHaveClass('shrink-0');
    const nameEl = screen.getByText('Skill 1', { exact: true });
    expect(nameEl).toHaveClass('truncate');
    expect(nameEl).not.toContainElement(numeral);
  });

  it("leaves the drag handle as the row's only affordance besides remove", () => {
    render(<EntryList rows={[entryRow(1, [0], [4])]} bandsAt={new Map()} {...defaultProps} />);
    const handle = screen.getByRole('button', { name: /reorder skill 1/i });
    expect(handle).not.toHaveAttribute('aria-expanded');
  });

  it('marks the row whose level the Booster speeds up', () => {
    render(
      <EntryList
        rows={[entryRow(1, [0], [4]), entryRow(1, [1], [5])]}
        bandsAt={new Map()}
        boostedSteps={new Set([1])}
        {...defaultProps}
      />
    );
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0]).queryByRole('img', { name: /booster/i })).toBeNull();
    expect(within(rows[1]).getByRole('img', { name: /booster/i })).toBeInTheDocument();
  });
});

describe('EntryList Plan Milestones (CONTEXT.md)', () => {
  it("offers Add milestone on a row with none, anchored to that row's skill and level", async () => {
    const user = userEvent.setup();
    const added: Array<[number, number]> = [];
    render(
      <EntryList
        rows={[entryRow(1, [0], [4])]}
        bandsAt={new Map()}
        {...defaultProps}
        onAddMilestone={(skillTypeID, targetLevel) => added.push([skillTypeID, targetLevel])}
      />
    );

    await user.click(screen.getByRole('button', { name: /add milestone to skill 1 iv/i }));
    expect(added).toEqual([[1, 4]]);
  });

  it('shows the milestone badge and offers Rename/Remove once one is anchored', async () => {
    const user = userEvent.setup();
    const finish = new Date('2026-09-01T00:00:00Z');
    const renamed: string[] = [];
    const removed: string[] = [];
    render(
      <EntryList
        rows={[entryRow(1, [0], [4])]}
        bandsAt={new Map()}
        {...defaultProps}
        milestoneStatusFor={() => ({
          milestone: { id: 'm1', name: 'Fly Loki', skillTypeID: 1, level: 4 },
          state: 'projected',
          finish,
        })}
        onRenameMilestone={(id) => renamed.push(id)}
        onRemoveMilestone={(id) => removed.push(id)}
      />
    );

    expect(screen.getByText('Fly Loki')).toBeInTheDocument();
    expect(screen.getByText(formatLocalDate(finish))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /milestone actions for skill 1 iv/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    expect(renamed).toEqual(['m1']);

    await user.click(screen.getByRole('button', { name: /milestone actions for skill 1 iv/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove' }));
    expect(removed).toEqual(['m1']);
  });

  it('reads Reached instead of a date once the goal is already trained', () => {
    render(
      <EntryList
        rows={[entryRow(1, [0], [4])]}
        bandsAt={new Map()}
        {...defaultProps}
        milestoneStatusFor={() => ({
          milestone: { id: 'm1', name: 'Fly Loki', skillTypeID: 1, level: 4 },
          state: 'reached',
          finish: null,
        })}
      />
    );

    expect(screen.getByText('Fly Loki')).toBeInTheDocument();
    expect(screen.getByText('Reached')).toBeInTheDocument();
  });
});
