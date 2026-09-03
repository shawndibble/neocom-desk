import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@/i18n';
import { EntryList } from './EntryList';
import { entryId } from './reorder';
import { markerRowId } from './markers';
import { DEFAULT_COLUMN_VISIBILITY, type ColumnVisibility } from './columnPreference';
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
    render(<EntryList rows={rows} bandsAt={new Map()} {...defaultProps} />);
    expect(screen.getByText(/prereq/i)).toBeInTheDocument();
    // No drag handle (reorder label) or priority control for the prereq row's skill.
    expect(screen.queryByRole('button', { name: /reorder skill 9/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reorder skill 1/i })).toBeInTheDocument();
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
