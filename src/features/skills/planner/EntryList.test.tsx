import { describe, it, expect, afterEach, vi } from 'vitest';
import { stubViewport } from '@/test/viewport';
import { screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { EntryList } from './EntryList';
import { entryId } from './reorder';
import { markerRowId } from './markers';
import { DEFAULT_COLUMN_VISIBILITY, type ColumnVisibility } from './columnPreference';
import type { MergedRow } from './queueRows';
import type { PlanEntry } from '@/engine/types';
import { formatLocalDate } from '@/lib/localDate';
import { renderInRouter } from '@/test/render';

const entry = (skillTypeID: number, targetLevel = 1): PlanEntry => ({ skillTypeID, targetLevel });

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
  onStageSkillDetail: noop,
  removalBlockedReason: () => undefined,
  onRemoveMarker: noop,
  onEditMarker: noop,
  onSetPriority: noop,
  onPromotePrereq: noop,
  milestoneStatusFor: () => undefined,
  onAddMilestone: noop,
  onRenameMilestone: noop,
  onRemoveMilestone: noop,
};

function mockDesktop(matches: boolean): () => void {
  return stubViewport(() => matches);
}

describe('EntryList step timeline renders in the viewer local timezone (#207)', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('renders the previous local day for a start instant just after UTC midnight', () => {
    process.env.TZ = 'America/Los_Angeles';
    const rows = [entryRow(1, [0])];
    renderInRouter(
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

describe('EntryList drag instructions', () => {
  it('does not point at a Move menu that rows do not have', () => {
    renderInRouter(<EntryList rows={[entryRow(1, [0])]} bandsAt={new Map()} {...defaultProps} />);
    const text = document.querySelector('[id^="DndDescribedBy"]')?.textContent ?? '';
    expect(text).toMatch(/to pick up an entry or remap marker/i);
    expect(text).not.toMatch(/move menu/i);
  });
});

describe('EntryList Booster marks', () => {
  it('marks only the entry row owning the boosted step', () => {
    const rows = [entryRow(1, [0]), entryRow(2, [1])];
    renderInRouter(
      <EntryList rows={rows} bandsAt={new Map()} boostedSteps={new Set([0])} {...defaultProps} />
    );
    const marks = screen.getAllByRole('img', { name: /booster speeds this skill up/i });
    expect(marks).toHaveLength(1);
    expect(screen.getByText(/^Skill 1\b/).closest('li')).toContainElement(marks[0]);
  });

  it('marks nothing when no Booster is active', () => {
    const rows = [entryRow(1, [0]), entryRow(2, [1])];
    renderInRouter(<EntryList rows={rows} bandsAt={new Map()} {...defaultProps} />);
    expect(
      screen.queryByRole('img', { name: /booster speeds this skill up/i })
    ).not.toBeInTheDocument();
  });

  it('an entry spanning several boosted step indices still shows exactly one mark', () => {
    const rows = [entryRow(1, [0, 1, 2])];
    renderInRouter(
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
    renderInRouter(<EntryList rows={prereqRows} bandsAt={new Map()} {...defaultProps} />);
    expect(screen.getByText(/prereq/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/normal priority, skill 9/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reorder skill 1/i })).toBeInTheDocument();
  });

  it('offers a drag handle, because dragging a prereq row promotes it into an entry', () => {
    renderInRouter(<EntryList rows={prereqRows} bandsAt={new Map()} {...defaultProps} />);
    expect(
      screen.getByRole('button', { name: /drag skill 9 i into the plan/i })
    ).toBeInTheDocument();
  });

  it('offers the same promotion without a drag, for anyone not dragging', () => {
    const promoted: string[] = [];
    renderInRouter(
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
    renderInRouter(<EntryList rows={prereqRows} bandsAt={new Map()} {...defaultProps} />);
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
    renderInRouter(<EntryList rows={[entryRow(1, [0])]} bandsAt={new Map()} {...defaultProps} />);
    expect(
      screen.getByRole('button', { name: /reorder skill 1 i — press space then arrow keys/i })
    ).toBeInTheDocument();
  });

  it("a marker row's drag handle names the keyboard alternative", () => {
    renderInRouter(
      <EntryList
        rows={[{ kind: 'marker', id: markerRowId(0), markerIndex: 0 }]}
        bandsAt={new Map()}
        {...defaultProps}
      />
    );
    expect(
      screen.getByRole('button', { name: /reorder remap marker 1 — press space then arrow keys/i })
    ).toBeInTheDocument();
  });
});

describe('EntryList empty state', () => {
  it('shows the empty-entries message when there are no rows', () => {
    renderInRouter(<EntryList rows={[]} bandsAt={new Map()} {...defaultProps} />);
    expect(screen.getByText('No entries yet. Add a skill to get started.')).toBeInTheDocument();
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
    renderInRouter(
      <EntryList
        rows={rows}
        bandsAt={new Map()}
        {...defaultProps}
        attributesFor={() => ({ primary: 'perception', secondary: 'willpower' })}
        columns={columns}
      />
    );
    expect(screen.queryByText('PER/WIL')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/ priority, /i)).not.toBeInTheDocument();
    expect(screen.queryByText('1m')).not.toBeInTheDocument();
    expect(screen.queryByText('10m')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reorder skill 1/i })).toBeInTheDocument();
    expect(screen.getByText(/^Skill 1\b/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /more actions for skill 1/i })).toBeInTheDocument();
  });

  it('shows the attribute badge, priority control, per-level and cumulative time when enabled', () => {
    const rows = [entryRow(1, [0])];
    renderInRouter(
      <EntryList
        rows={rows}
        bandsAt={new Map()}
        {...defaultProps}
        attributesFor={() => ({ primary: 'perception', secondary: 'willpower' })}
        columns={{ ...DEFAULT_COLUMN_VISIBILITY, priority: true }}
      />
    );
    expect(screen.getByText('PER/WIL')).toBeInTheDocument();
    expect(screen.getByLabelText(/ priority, /i)).toBeInTheDocument();
  });

  it('names the attribute pair for screen readers with sr-only text, not a label on a bare span', () => {
    renderInRouter(
      <EntryList
        rows={[entryRow(1, [0])]}
        bandsAt={new Map()}
        {...defaultProps}
        attributesFor={() => ({ primary: 'perception', secondary: 'willpower' })}
      />
    );
    expect(screen.getByText('PER/WIL')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Perception / Willpower attributes')).toBeInTheDocument();
    expect(document.querySelector('span[aria-label$=" attributes"]')).toBeNull();
  });

  it('leaves priority off by default — it is an editing control, not a readout', () => {
    renderInRouter(<EntryList rows={[entryRow(1, [0])]} bandsAt={new Map()} {...defaultProps} />);
    expect(screen.queryByLabelText(/ priority, /i)).not.toBeInTheDocument();
  });

  it('sets a priority from the pill menu instead of a full-width select', async () => {
    const user = userEvent.setup();
    const calls: Array<[number, string]> = [];
    renderInRouter(
      <EntryList
        rows={[entryRow(1, [0])]}
        bandsAt={new Map()}
        {...defaultProps}
        columns={{ ...DEFAULT_COLUMN_VISIBILITY, priority: true }}
        onSetPriority={(skillTypeID, priority) => calls.push([skillTypeID, priority])}
      />
    );

    await user.click(screen.getByLabelText(/normal priority, skill 1/i));
    await user.click(screen.getByRole('menuitem', { name: 'High' }));

    expect(calls).toEqual([[1, 'high']]);
  });
});

describe('EntryList narrow vs desktop layout (#114)', () => {
  it('folds a row to two lines below the desktop breakpoint, with every optional value labelled on line two', () => {
    const restore = mockDesktop(false);
    try {
      const rows = [entryRow(1, [5])];
      renderInRouter(
        <EntryList
          rows={rows}
          bandsAt={new Map()}
          {...defaultProps}
          attributesFor={() => ({ primary: 'perception', secondary: 'willpower' })}
          columns={{ ...DEFAULT_COLUMN_VISIBILITY, priority: true }}
        />
      );
      const nameLine = screen.getByText(/^Skill 1\b/).closest('div');
      expect(nameLine).not.toBeNull();
      expect(within(nameLine as HTMLElement).queryByText('10m')).toBeNull();
      expect(screen.getByText('PER/WIL')).toBeInTheDocument();
      expect(screen.getByLabelText(/normal priority, skill 1/i)).toBeInTheDocument();
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
      renderInRouter(
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
      renderInRouter(
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

  it('pads the priority pill out to the sm touch tier below the desktop breakpoint', () => {
    const restore = mockDesktop(false);
    try {
      renderInRouter(
        <EntryList
          rows={[entryRow(1, [5])]}
          bandsAt={new Map()}
          {...defaultProps}
          columns={{ ...DEFAULT_COLUMN_VISIBILITY, priority: true }}
        />
      );
      const pill = screen.getByLabelText(/normal priority, skill 1/i);
      expect(pill).toHaveClass('h-9');
      expect(pill.querySelector('span')).toHaveClass('px-1');
    } finally {
      restore();
    }
  });

  it('leaves the desktop pill unpadded, so it stays flush with the sm controls in its row', () => {
    const restore = mockDesktop(true);
    try {
      renderInRouter(
        <EntryList
          rows={[entryRow(1, [5])]}
          bandsAt={new Map()}
          {...defaultProps}
          columns={{ ...DEFAULT_COLUMN_VISIBILITY, priority: true }}
        />
      );
      expect(screen.getByLabelText(/normal priority, skill 1/i)).not.toHaveClass('h-9');
    } finally {
      restore();
    }
  });

  it('shows a single-line row under Takes/Done by headers on desktop', () => {
    const restore = mockDesktop(true);
    try {
      const rows = [entryRow(1, [5])];
      renderInRouter(<EntryList rows={rows} bandsAt={new Map()} {...defaultProps} />);
      expect(screen.getByText('Takes')).toBeInTheDocument();
      expect(screen.getByText('Done by')).toBeInTheDocument();
      expect(screen.getByText('1m')).toBeInTheDocument();
      expect(screen.getByText('10m')).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it("labels each entry row's Takes/Done by cell for screen readers, on desktop only", () => {
    const restore = mockDesktop(true);
    try {
      renderInRouter(<EntryList rows={[entryRow(1, [5])]} bandsAt={new Map()} {...defaultProps} />);
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
      const { unmount } = renderInRouter(
        <EntryList rows={rows} bandsAt={new Map()} {...defaultProps} />
      );
      expect(screen.getAllByText('Takes:')).toHaveLength(2);
      expect(screen.getAllByText('Done by:')).toHaveLength(2);
      unmount();
    } finally {
      restore();
    }

    restore = mockDesktop(false);
    try {
      renderInRouter(<EntryList rows={rows} bandsAt={new Map()} {...defaultProps} />);
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
      const rows = [entryRow(1, [0]), entryRow(2, [864])];
      renderInRouter(
        <EntryList rows={rows} bandsAt={new Map()} {...defaultProps} startDate={startDate} />
      );
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
      renderInRouter(<EntryList rows={[entryRow(1, [5])]} bandsAt={new Map()} {...defaultProps} />);
      expect(screen.getByText('10m')).toBeInTheDocument();
    } finally {
      restore();
    }
  });
});

describe('EntryList reorder affordance', () => {
  const rows: MergedRow[] = [
    entryRow(1, [0]),
    { kind: 'marker', id: markerRowId(0), markerIndex: 0 },
    entryRow(2, [1]),
  ];

  it('offers only the drag handle, at every width — no Move up/down control', () => {
    for (const desktop of [false, true]) {
      const restore = mockDesktop(desktop);
      try {
        const { unmount } = renderInRouter(
          <EntryList rows={rows} bandsAt={new Map()} {...defaultProps} />
        );

        expect(screen.getByRole('button', { name: /reorder skill 1 i/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^move /i })).not.toBeInTheDocument();

        unmount();
      } finally {
        restore();
      }
    }
  });
});

describe('EntryList drag announcements (#1493)', () => {
  it('renders the translated keyboard instructions dnd-kit exposes up front', () => {
    const rows: MergedRow[] = [
      entryRow(1, [0]),
      { kind: 'marker', id: markerRowId(0), markerIndex: 0 },
    ];
    renderInRouter(<EntryList rows={rows} bandsAt={new Map()} {...defaultProps} />);
    expect(screen.getByText(/to pick up an entry or remap marker/i)).toBeInTheDocument();
  });
});

describe('EntryList marker row attributes', () => {
  const rows: MergedRow[] = [
    entryRow(1, [0]),
    { kind: 'marker', id: markerRowId(0), markerIndex: 0 },
  ];

  it('shows the plain divider when no target attributes are known for this marker', () => {
    renderInRouter(<EntryList rows={rows} bandsAt={new Map()} {...defaultProps} />);
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
    renderInRouter(
      <EntryList
        rows={rows}
        bandsAt={new Map()}
        {...defaultProps}
        markerAttributesFor={(markerIndex) => (markerIndex === 0 ? attributes : undefined)}
      />
    );
    expect(screen.getByText('PER 27 / WIL 21 / INT 17 / MEM 17 / CHA 17')).toBeInTheDocument();
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
    renderInRouter(
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

    const { unmount } = renderInRouter(
      <EntryList rows={rows} bandsAt={new Map()} {...defaultProps} onEditMarker={onEditMarker} />
    );
    await user.click(screen.getByRole('button', { name: 'Remap marker 1' }));
    expect(onEditMarker).toHaveBeenCalledWith(0);
    unmount();

    onEditMarker.mockClear();
    renderInRouter(
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
    renderInRouter(
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
    renderInRouter(
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
  for (const desktop of [false, true]) {
    const width = desktop ? 'desktop' : 'narrow';

    it(`labels a row with its own single level, and offers no toggle (${width})`, () => {
      const restore = mockDesktop(desktop);
      try {
        renderInRouter(
          <EntryList rows={[entryRow(1, [0], [4])]} bandsAt={new Map()} {...defaultProps} />
        );
        const row = screen.getByText(/^Skill 1\b/).closest('li');
        expect(within(row as HTMLElement).getByText('IV', { exact: true })).toBeInTheDocument();
        expect(screen.queryByRole('list', { name: /levels trained/i })).toBeNull();
      } finally {
        restore();
      }
    });
  }

  it("shows a skill's two levels as two separate rows", () => {
    renderInRouter(
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
    renderInRouter(
      <EntryList rows={[entryRow(1, [0], [4])]} bandsAt={new Map()} {...defaultProps} />
    );
    const numeral = screen.getByText('IV', { exact: true });
    expect(numeral.parentElement).toHaveClass('shrink-0');
    const nameEl = screen.getByText('Skill 1', { exact: true });
    expect(nameEl).toHaveClass('truncate');
    expect(nameEl).not.toContainElement(numeral);
  });

  it("leaves the drag handle as the row's only affordance besides remove", () => {
    renderInRouter(
      <EntryList rows={[entryRow(1, [0], [4])]} bandsAt={new Map()} {...defaultProps} />
    );
    const handle = screen.getByRole('button', { name: /reorder skill 1/i });
    expect(handle).not.toHaveAttribute('aria-expanded');
  });

  it('marks the row whose level the Booster speeds up', () => {
    renderInRouter(
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

describe('EntryList row menu (#2223: a later entry still needing this level)', () => {
  const openMenu = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: /more actions for skill 1/i }));

  it('ends the row in one ⋮, with no standalone remove button', () => {
    renderInRouter(
      <EntryList rows={[entryRow(1, [0], [4])]} bandsAt={new Map()} {...defaultProps} />
    );
    expect(screen.getByRole('button', { name: /more actions for skill 1/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^remove skill 1/i })).toBeNull();
  });

  it('removes the entry from the menu when nothing depends on the row', async () => {
    const user = userEvent.setup();
    const removed: unknown[] = [];
    renderInRouter(
      <EntryList
        rows={[entryRow(1, [0], [4])]}
        bandsAt={new Map()}
        {...defaultProps}
        onRemove={(...args) => removed.push(args)}
      />
    );
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /remove skill 1/i }));
    expect(removed).toEqual([[1, 4]]);
  });

  it('marks the item blocked via aria-disabled, so a click no-ops instead of accepting one that would silently undo itself', async () => {
    const user = userEvent.setup();
    const removed: unknown[] = [];
    renderInRouter(
      <EntryList
        rows={[entryRow(1, [0], [4])]}
        bandsAt={new Map()}
        {...defaultProps}
        onRemove={(...args) => removed.push(args)}
        removalBlockedReason={() => 'Required by Skill 2 V'}
      />
    );
    await openMenu(user);
    const item = screen.getByRole('menuitem', { name: /remove skill 1/i });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    await user.click(item);
    expect(removed).toEqual([]);
  });

  it('surfaces the blocked reason as the tooltip on hover', async () => {
    const user = userEvent.setup();
    renderInRouter(
      <EntryList
        rows={[entryRow(1, [0], [4])]}
        bandsAt={new Map()}
        {...defaultProps}
        removalBlockedReason={() => 'Required by Skill 2 V'}
      />
    );
    await openMenu(user);
    await user.hover(screen.getByRole('menuitem', { name: /remove skill 1/i }));
    expect(await screen.findByText('Required by Skill 2 V')).toBeInTheDocument();
  });
});

describe('EntryList Plan Milestones (GLOSSARY.md)', () => {
  it("offers Add milestone on a row with none, anchored to that row's skill and level", async () => {
    const user = userEvent.setup();
    const added: Array<[number, number]> = [];
    renderInRouter(
      <EntryList
        rows={[entryRow(1, [0], [4])]}
        bandsAt={new Map()}
        {...defaultProps}
        onAddMilestone={(skillTypeID, targetLevel) => added.push([skillTypeID, targetLevel])}
      />
    );

    await user.click(screen.getByRole('button', { name: /more actions for skill 1 iv/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Add milestone' }));
    expect(added).toEqual([[1, 4]]);
  });

  it('shows the milestone badge and offers Rename/Remove once one is anchored', async () => {
    const user = userEvent.setup();
    const finish = new Date('2026-09-01T00:00:00Z');
    const renamed: string[] = [];
    const removed: string[] = [];
    renderInRouter(
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

    await user.click(screen.getByRole('button', { name: /more actions for skill 1 iv/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    expect(renamed).toEqual(['m1']);

    await user.click(screen.getByRole('button', { name: /more actions for skill 1 iv/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove milestone' }));
    expect(removed).toEqual(['m1']);
  });

  it('reads Reached instead of a date once the goal is already trained', () => {
    renderInRouter(
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

describe("pinnedInProgress (#1701 follow-up): the row that IS the in-game queue's currently-training level shows its real remaining time", () => {
  const takesOnly = { ...DEFAULT_COLUMN_VISIBILITY, cumulativeTime: false };

  it('shows the level\'s real remaining time instead of a bare "0m" for the row it pins, on the narrow layout', () => {
    const rows = [entryRow(1, [])];
    renderInRouter(
      <EntryList
        rows={rows}
        bandsAt={new Map()}
        {...defaultProps}
        columns={takesOnly}
        pinnedInProgress={{ id: entryId(entry(1, 1)), seconds: 600 }}
      />
    );
    expect(screen.getByText('10m')).toBeInTheDocument();
    expect(screen.queryByText('0m')).not.toBeInTheDocument();
  });

  it('shows it on the desktop layout too', () => {
    const restore = mockDesktop(true);
    try {
      const rows = [entryRow(1, [])];
      renderInRouter(
        <EntryList
          rows={rows}
          bandsAt={new Map()}
          {...defaultProps}
          columns={takesOnly}
          pinnedInProgress={{ id: entryId(entry(1, 1)), seconds: 600 }}
        />
      );
      expect(screen.getByText('10m')).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('leaves every other row reading its own duration, pinned or not', () => {
    const rows = [entryRow(1, []), entryRow(2, [0])];
    renderInRouter(
      <EntryList
        rows={rows}
        bandsAt={new Map()}
        {...defaultProps}
        columns={takesOnly}
        pinnedInProgress={{ id: entryId(entry(1, 1)), seconds: 600 }}
      />
    );
    expect(screen.getByText('10m')).toBeInTheDocument();
    expect(screen.getByText('1m')).toBeInTheDocument();
  });

  it('renders a plain "0m" when nothing is pinned (no in-game queue lead, or it is paused)', () => {
    const rows = [entryRow(1, [])];
    renderInRouter(
      <EntryList
        rows={rows}
        bandsAt={new Map()}
        {...defaultProps}
        columns={takesOnly}
        pinnedInProgress={null}
      />
    );
    expect(screen.getByText('0m')).toBeInTheDocument();
  });
});

describe('EntryList groups consecutive levels of one skill on the phone (#6562)', () => {
  const rows = [entryRow(1, [0]), entryRow(1, [1], [2]), entryRow(2, [2])];
  const skillLinks = (name: string) => screen.queryAllByRole('link', { name });

  it('names the skill once for a run, while each level keeps its own grip', () => {
    renderInRouter(
      <EntryList {...defaultProps} rows={rows} bandsAt={new Map()} onReorder={noop} />
    );
    expect(skillLinks('Skill 1')).toHaveLength(1);
    expect(skillLinks('Skill 2')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /Reorder Skill 1/ })).toHaveLength(2);
  });

  it('repeats the name on every level at desktop width', () => {
    const restore = mockDesktop(true);
    renderInRouter(
      <EntryList {...defaultProps} rows={rows} bandsAt={new Map()} onReorder={noop} />
    );
    expect(skillLinks('Skill 1')).toHaveLength(2);
    restore();
  });
});
