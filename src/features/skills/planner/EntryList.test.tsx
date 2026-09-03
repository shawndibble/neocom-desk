import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@/i18n';
import { EntryList } from './EntryList';
import { entryId } from './reorder';
import { markerRowId } from './markers';
import { DEFAULT_COLUMN_VISIBILITY, type ColumnVisibility } from './columnPreference';
import type { MergedRow } from './queueRows';
import type { PlanEntry } from '@/engine/types';

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
  onSetPriority: noop,
  onPromotePrereq: noop,
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
    // Anchored: an unanchored /Skill 1/ also matches the new "Move Skill 1
    // up/down" tooltip text that used to sit elsewhere in the row.
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
      />
    );
    expect(screen.getByText('PER/WIL')).toBeInTheDocument();
    expect(screen.getByLabelText(/priority for/i)).toBeInTheDocument();
  });
});

describe('EntryList narrow vs desktop layout (#114)', () => {
  it('folds a row to two lines below the desktop breakpoint, with cumulative time reachable from the per-level cell', () => {
    const restore = mockDesktop(false);
    try {
      const rows = [entryRow(1, [5])];
      render(
        <EntryList
          rows={rows}
          bandsAt={new Map()}
          {...defaultProps}
          attributesFor={() => ({ primary: 'perception', secondary: 'willpower' })}
        />
      );
      // Line 1: cumulative time (10m) is visible without a header row on narrow screens.
      expect(screen.queryByText('Per-level')).not.toBeInTheDocument();
      expect(screen.getByText('10m')).toBeInTheDocument();
      // Line 2: attribute badge, priority, and per-level time (1m, with cumulative as a tooltip).
      expect(screen.getByText('PER/WIL')).toBeInTheDocument();
      const perLevelCell = screen.getByText('1m');
      fireEvent.focus(perLevelCell);
      const tooltip = screen.getByText(/Cumulative: 10m/);
      expect(tooltip).toHaveAttribute('role', 'tooltip');
    } finally {
      restore();
    }
  });

  it('disabling cumulative time removes it from the narrow-screen tooltip as well as the row', () => {
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
      expect(screen.queryByText(/Cumulative:/)).not.toBeInTheDocument();
      expect(screen.queryByText('10m')).not.toBeInTheDocument();
      expect(screen.getByText('1m')).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('shows a single-line row with a column header on desktop', () => {
    const restore = mockDesktop(true);
    try {
      const rows = [entryRow(1, [5])];
      render(<EntryList rows={rows} bandsAt={new Map()} {...defaultProps} />);
      expect(screen.getByText('Per-level')).toBeInTheDocument();
      expect(screen.getByText('Cumulative')).toBeInTheDocument();
      expect(screen.getByText('1m')).toBeInTheDocument();
      expect(screen.getByText('10m')).toBeInTheDocument();
      expect(screen.queryByText(/Cumulative: /)).not.toBeInTheDocument();
    } finally {
      restore();
    }
  });
});
describe('EntryList reorder affordance', () => {
  it('offers the drag handle alone at every width — no Up/Down buttons', () => {
    for (const desktop of [false, true]) {
      const restore = mockDesktop(desktop);
      try {
        const rows: MergedRow[] = [
          entryRow(1, [0]),
          { kind: 'marker', id: markerRowId(0), markerIndex: 0 },
          entryRow(2, [1]),
        ];
        const { unmount } = render(<EntryList rows={rows} bandsAt={new Map()} {...defaultProps} />);

        // Touch drag works on the handle (it carries `touch-action: none`),
        // so the Up/Down pair #223 added as a stand-in is gone — it cost two
        // 36px controls per row, which is what squeezed the skill name on a
        // phone.
        expect(screen.queryByRole('button', { name: /move .* (up|down)/i })).toBeNull();
        expect(screen.getByRole('button', { name: /reorder skill 1/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /reorder remap marker/i })).toBeInTheDocument();

        unmount();
      } finally {
        restore();
      }
    }
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

  it("shows the marker's target attribute spread instead of the divider once known", () => {
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

describe('EntryList entry level disclosure (#254)', () => {
  // The reported bug: "Caldari Carrier V" pulled in I–IV as scheduled steps,
  // but the row said "Caldari Carrier V" with one aggregated time while the
  // prereq skills got a dimmed row per level — so the entry's own levels read
  // as missing. The row now says which levels it trains and can show them.
  for (const desktop of [false, true]) {
    const width = desktop ? 'desktop' : 'narrow';

    it(`labels a multi-level entry with the range it trains (${width})`, () => {
      const restore = mockDesktop(desktop);
      try {
        render(
          <EntryList rows={[entryRow(1, [0, 1, 2, 3, 4])]} bandsAt={new Map()} {...defaultProps} />
        );
        expect(screen.getByText(/^Skill 1 I–V$/)).toBeInTheDocument();
      } finally {
        restore();
      }
    });

    it(`reveals one line per level, each with its own time, when expanded (${width})`, () => {
      const restore = mockDesktop(desktop);
      try {
        render(
          <EntryList rows={[entryRow(1, [0, 1, 2, 3, 4])]} bandsAt={new Map()} {...defaultProps} />
        );
        const toggle = screen.getByRole('button', { expanded: false });
        expect(screen.queryByRole('list', { name: /levels trained for skill 1/i })).toBeNull();

        fireEvent.click(toggle);

        const breakdown = screen.getByRole('list', { name: /levels trained for skill 1/i });
        const levels = within(breakdown).getAllByRole('listitem');
        expect(levels).toHaveLength(5);
        expect(levels.map((li) => within(li).getByLabelText(/^Level \d$/).textContent)).toEqual([
          'I',
          'II',
          'III',
          'IV',
          'V',
        ]);
        // Each level shows its own duration. The collapsed row shows the sum
        // of all five instead — which is what read as the levels going
        // missing.
        expect(levels.map((li) => within(li).getAllByText(/^\d+m$/)[0].textContent)).toEqual([
          '1m',
          '1m',
          '1m',
          '1m',
          '1m',
        ]);
        // The level's running total folds exactly like the row above it
        // (#114): its own column on desktop, a tooltip on the duration below
        // `md`, where two unlabelled 6rem columns would not fit a phone.
        expect(within(levels[1]).getAllByText(/^\d+m$/)).toHaveLength(desktop ? 2 : 1);
        if (!desktop) {
          fireEvent.focus(within(levels[1]).getByText(/^\d+m$/));
          expect(screen.getByText(/^Cumulative: /)).toHaveAttribute('role', 'tooltip');
        }

        fireEvent.click(screen.getByRole('button', { expanded: true }));
        expect(screen.queryByRole('list', { name: /levels trained for skill 1/i })).toBeNull();
      } finally {
        restore();
      }
    });
  }

  it('shows only the levels the plan actually queues, not I through the target', () => {
    // Target V on a character already at III: the plan trains IV and V.
    render(
      <EntryList rows={[entryRow(1, [0, 1], [4, 5])]} bandsAt={new Map()} {...defaultProps} />
    );
    expect(screen.getByText(/^Skill 1 IV–V$/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { expanded: false }));
    const breakdown = screen.getByRole('list', { name: /levels trained for skill 1/i });
    expect(within(breakdown).getAllByRole('listitem')).toHaveLength(2);
    expect(within(breakdown).getByLabelText('Level 4')).toBeInTheDocument();
    expect(within(breakdown).getByLabelText('Level 5')).toBeInTheDocument();
  });

  it('gives a single-level entry no toggle and no range, leaving the row as it was', () => {
    render(<EntryList rows={[entryRow(1, [0])]} bandsAt={new Map()} {...defaultProps} />);
    expect(screen.getByText(/^Skill 1 I$/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { expanded: false })).toBeNull();
  });

  it('leaves the drag handle as the only reorder affordance — the toggle is not a second one', () => {
    render(<EntryList rows={[entryRow(1, [0, 1])]} bandsAt={new Map()} {...defaultProps} />);
    const handle = screen.getByRole('button', { name: /reorder skill 1/i });
    expect(handle).not.toHaveAttribute('aria-expanded');
    expect(screen.getByRole('button', { expanded: false })).not.toBe(handle);
  });

  it('marks only the boosted level inside the breakdown', () => {
    render(
      <EntryList
        rows={[entryRow(1, [0, 1, 2])]}
        bandsAt={new Map()}
        boostedSteps={new Set([2])}
        {...defaultProps}
      />
    );
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    const breakdown = screen.getByRole('list', { name: /levels trained for skill 1/i });
    const levels = within(breakdown).getAllByRole('listitem');
    expect(within(levels[0]).queryByRole('img', { name: /booster/i })).toBeNull();
    expect(within(levels[2]).getByRole('img', { name: /booster/i })).toBeInTheDocument();
  });
});
