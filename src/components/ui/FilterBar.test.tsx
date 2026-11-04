import { useState, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { BELOW_DESKTOP_QUERY } from '@/lib/useIsBelowDesktop';
import { NARROW_QUERY } from '@/lib/useIsNarrow';
import { stubViewport } from '@/test/viewport';
import { FilterBar, FilterField, type ActiveFilter } from './FilterBar';
import { FilterChip } from './FilterChip';
import { SearchInput } from './SearchInput';
import { TextInput } from './TextInput';

interface Filter {
  text: string;
  unreadOnly: boolean;
  from: string;
}

const EMPTY: Filter = { text: '', unreadOnly: false, from: '' };

/**
 * jsdom's stub never matches (`vitest.setup.ts`), which `useIsNarrow` reads as
 * a pointer viewport — so the funnel box under the row is what every route
 * test sees by default. Narrow has to be asked for.
 */
function useNarrowViewport(): void {
  stubViewport(NARROW_QUERY);
}

function activeFilters(filter: Filter): ActiveFilter<Filter>[] {
  return [
    ...(filter.unreadOnly
      ? [{ label: 'Unread only', clear: (f: Filter) => ({ ...f, unreadOnly: false }) }]
      : []),
    ...(filter.from === ''
      ? []
      : [{ label: 'From', value: filter.from, clear: (f: Filter) => ({ ...f, from: '' }) }]),
  ];
}

function Harness({
  initial = EMPTY,
  actions,
  pointerSurface,
  resultCount,
}: {
  initial?: Filter;
  actions?: ReactNode;
  pointerSurface?: 'row' | 'popover';
  resultCount?: number;
}) {
  const [filter, setFilter] = useState(initial);
  return (
    <>
      <FilterBar
        value={filter}
        onChange={setFilter}
        active={activeFilters(filter)}
        resultCount={resultCount}
        actions={actions}
        pointerSurface={pointerSurface}
        search={
          <SearchInput
            aria-label="Search"
            value={filter.text}
            onChange={(e) => setFilter({ ...filter, text: e.target.value })}
          />
        }
      >
        {(draft, setDraft) => (
          <>
            <FilterChip
              label="Unread only"
              selected={draft.unreadOnly}
              onToggle={() => setDraft({ ...draft, unreadOnly: !draft.unreadOnly })}
            />
            <FilterField label="From">
              <TextInput
                aria-label="From"
                value={draft.from}
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
              />
            </FilterField>
          </>
        )}
      </FilterBar>
      <p>{`unread:${String(filter.unreadOnly)} from:${filter.from}`}</p>
    </>
  );
}

describe('FilterBar', () => {
  const columns = <button type="button">Columns</button>;

  it('draws actions beside the trigger, outside the filter group', () => {
    render(<Harness actions={columns} />);
    const picker = screen.getByRole('button', { name: 'Columns' });
    expect(picker.nextElementSibling).toContainElement(
      screen.getByRole('button', { name: 'Filters' })
    );
  });

  it('keeps actions in the row, not the sheet, when narrow', async () => {
    useNarrowViewport();
    const user = userEvent.setup();
    render(<Harness actions={columns} />);
    const picker = screen.getByRole('button', { name: 'Columns' });
    expect(picker.nextElementSibling).toContainElement(
      screen.getByRole('button', { name: 'Filters' })
    );
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByRole('dialog')).not.toContainElement(picker);
  });

  it('hides the controls behind a trigger on a pointer viewport too', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Unread only' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByRole('button', { name: 'Unread only' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('wires the inline funnel to its group without claiming a popup', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const funnel = screen.getByRole('button', { name: 'Filters' });
    expect(funnel).not.toHaveAttribute('aria-haspopup');
    expect(funnel).toHaveAttribute('aria-expanded', 'false');
    await user.click(funnel);
    expect(funnel).toHaveAttribute('aria-expanded', 'true');
    const region = document.getElementById(funnel.getAttribute('aria-controls') ?? '');
    expect(region).toContainElement(screen.getByRole('group', { name: 'Filters' }));
  });

  it('commits a pointer-viewport edit immediately, with no Apply step', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByRole('button', { name: 'Unread only' }));
    expect(screen.getByText('unread:true from:')).toBeInTheDocument();
  });

  it('hides the controls behind a trigger when narrow', () => {
    useNarrowViewport();
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unread only' })).not.toBeInTheDocument();
    // The search box is the page's primary affordance and never moves.
    expect(screen.getByRole('searchbox', { name: 'Search' })).toBeInTheDocument();
  });

  it('commits a sheet edit as it is made, with no Apply step', async () => {
    useNarrowViewport();
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByRole('button', { name: 'Unread only' }));
    expect(screen.getByText('unread:true from:')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('names the trigger with the number of active filters', async () => {
    useNarrowViewport();
    const user = userEvent.setup();
    render(<Harness initial={{ ...EMPTY, unreadOnly: true }} />);
    const trigger = screen.getByRole('button', { name: 'Filters (1 active)' });
    // Drawn as well as announced — colour is never the only signal.
    expect(trigger.parentElement).toHaveTextContent('1');
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
  });

  it('names the trigger for more than one active filter', () => {
    useNarrowViewport();
    render(<Harness initial={{ ...EMPTY, unreadOnly: true, from: 'CONCORD' }} />);
    // `count` is i18next's plural selector, not a plain interpolation — this
    // pins that the base key still resolves for the non-one case.
    expect(screen.getByRole('button', { name: 'Filters (2 active)' })).toBeInTheDocument();
  });

  it('leaves fields uncaptioned in the pointer-width box', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByRole('textbox', { name: 'From' })).toBeInTheDocument();
    expect(screen.queryByText('From')).not.toBeInTheDocument();
  });

  it('captions a field inline when it asks to', async () => {
    const user = userEvent.setup();
    render(
      <FilterBar
        value={0}
        onChange={() => {}}
        search={<SearchInput aria-label="Search" value="" onChange={() => {}} />}
      >
        {() => (
          <FilterField captionInline label="From">
            <TextInput aria-label="From" value="" onChange={() => {}} />
          </FilterField>
        )}
      </FilterBar>
    );
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByText('From')).toBeInTheDocument();
  });

  it('captions each field in the sheet', async () => {
    useNarrowViewport();
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByText('From')).toBeInTheDocument();
  });

  it('opens the controls in a popover off the funnel when asked to', async () => {
    const user = userEvent.setup();
    render(<Harness pointerSurface="popover" />);
    const trigger = screen.getByRole('button', { name: 'Filters' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const popover = screen.getByRole('dialog');
    // Uncaptioned, like the box under the row — captions are the sheet's.
    expect(screen.queryByText('From')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Unread only' }));
    expect(popover).toContainElement(screen.getByRole('button', { name: 'Unread only' }));
    expect(screen.getByText('unread:true from:')).toBeInTheDocument();
  });
});

describe('FilterBar trailing', () => {
  it('puts trailing view controls after the funnel, beside the search box', () => {
    render(
      <FilterBar<Filter>
        value={EMPTY}
        onChange={() => {}}
        search={<SearchInput aria-label="Search" />}
        actions={<button type="button">Columns</button>}
        trailing={<button type="button">Expand all</button>}
      >
        {() => null}
      </FilterBar>
    );
    const order = ['Columns', 'Filters', 'Expand all'].map((name) =>
      screen.getByRole('button', { name })
    );
    expect(
      order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      order[1].compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});

describe('FilterBar active filters', () => {
  const BOTH: Filter = { ...EMPTY, unreadOnly: true, from: 'CONCORD' };

  it('shows each active filter as one pill while the controls are closed', () => {
    render(<Harness initial={BOTH} />);
    const pills = screen.getByRole('group', { name: 'Active filters' });
    expect(pills).toContainElement(
      screen.getByRole('button', { name: 'Change filter: Unread only' })
    );
    expect(pills).toContainElement(
      screen.getByRole('button', { name: 'Change filter: From: CONCORD' })
    );
    expect(screen.getByRole('button', { name: 'Filters (2 active)' })).toBeInTheDocument();
  });

  it('draws no pill line when nothing is filtered', () => {
    render(<Harness />);
    expect(screen.queryByRole('group', { name: 'Active filters' })).not.toBeInTheDocument();
  });

  it('opens the box in place of the pills, never both at once', async () => {
    const user = userEvent.setup();
    render(<Harness initial={BOTH} />);
    await user.click(screen.getByRole('button', { name: 'Filters (2 active)' }));
    expect(screen.getByRole('group', { name: 'Filters' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Active filters' })).not.toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: 'Filters (2 active)' }));
    expect(screen.getByRole('group', { name: 'Active filters' })).toBeInTheDocument();
  });

  it("removes one filter from its pill's own remove button", async () => {
    const user = userEvent.setup();
    render(<Harness initial={BOTH} />);
    await user.click(screen.getByRole('button', { name: 'Remove filter: From: CONCORD' }));
    expect(screen.getByText('unread:true from:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filters (1 active)' })).toHaveFocus();
  });

  it('clears every filter from the pill line, leaving the search alone', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ ...BOTH, text: 'veldspar' }} />);
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.getByText('unread:false from:')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('veldspar');
  });

  it('opens the box on a pill click with focus on that filter', async () => {
    const user = userEvent.setup();
    render(<Harness initial={BOTH} />);
    await user.click(screen.getByRole('button', { name: 'Change filter: From: CONCORD' }));
    expect(screen.getByRole('textbox', { name: 'From' })).toHaveFocus();
  });

  it('offers Clear all in the open box too', async () => {
    const user = userEvent.setup();
    render(<Harness initial={BOTH} />);
    await user.click(screen.getByRole('button', { name: 'Filters (2 active)' }));
    const box = screen.getByRole('group', { name: 'Filters' });
    await user.click(within(box).getByRole('button', { name: 'Clear all' }));
    expect(screen.getByText('unread:false from:')).toBeInTheDocument();
  });

  it('shows no pills for a popover bar', () => {
    render(<Harness initial={BOTH} pointerSurface="popover" />);
    expect(screen.queryByRole('group', { name: 'Active filters' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filters (2 active)' })).toBeInTheDocument();
  });

  it('keeps the pills on the page under a phone row, and opens the sheet from one', async () => {
    useNarrowViewport();
    const user = userEvent.setup();
    render(<Harness initial={BOTH} />);
    await user.click(screen.getByRole('button', { name: 'Change filter: From: CONCORD' }));
    const dialog = screen.getByRole('dialog', { name: 'Filters' });
    await waitFor(() =>
      expect(within(dialog).getByRole('textbox', { name: 'From' })).toHaveFocus()
    );
  });

  it("says in the sheet's footer how many rows the filters leave", async () => {
    useNarrowViewport();
    const user = userEvent.setup();
    render(<Harness initial={BOTH} resultCount={312} />);
    await user.click(screen.getByRole('button', { name: 'Filters (2 active)' }));
    await user.click(screen.getByRole('button', { name: 'Show 312 results' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the sheet with Done when no count is given, and clears from its footer', async () => {
    useNarrowViewport();
    const user = userEvent.setup();
    render(<Harness initial={BOTH} />);
    await user.click(screen.getByRole('button', { name: 'Filters (2 active)' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Clear all' }));
    expect(screen.getByText('unread:false from:')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Clear all' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('FilterBar search slot', () => {
  it("marks its search box as the page's own, which / focuses", () => {
    render(<Harness />);
    const box = screen.getByRole('searchbox', { name: 'Search' });
    expect(box).toHaveAttribute('data-primary-search');
    expect(box).toHaveAttribute('aria-keyshortcuts', '/');
  });

  it('leaves a search box outside a FilterBar unmarked', () => {
    render(<SearchInput aria-label="Elsewhere" />);
    const box = screen.getByRole('searchbox', { name: 'Elsewhere' });
    expect(box).not.toHaveAttribute('data-primary-search');
    expect(box).not.toHaveAttribute('aria-keyshortcuts');
  });
});

describe('FilterField hideCaption', () => {
  it('leaves out the sheet caption for a control that already says it, keeping its pill key', async () => {
    useNarrowViewport();
    const user = userEvent.setup();
    render(
      <FilterBar
        value={true}
        onChange={() => {}}
        active={[{ label: 'Starred only', clear: () => false }]}
      >
        {() => (
          <FilterField label="Starred only" stretch={false} hideCaption>
            <FilterChip label="Starred only" selected onToggle={() => {}} />
          </FilterField>
        )}
      </FilterBar>
    );
    await user.click(screen.getByRole('button', { name: 'Change filter: Starred only' }));
    const dialog = screen.getByRole('dialog');
    // The chip's own label, once — no caption above it.
    expect(within(dialog).getAllByText('Starred only')).toHaveLength(1);
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Starred only' })).toHaveFocus()
    );
  });
});

describe('SearchInput pageSearch', () => {
  it('marks a page search box outside a FilterBar for /', () => {
    render(<SearchInput aria-label="Ships" pageSearch />);
    expect(screen.getByRole('searchbox', { name: 'Ships' })).toHaveAttribute(
      'aria-keyshortcuts',
      '/'
    );
  });
});

describe('FilterBar pill focus', () => {
  it('focuses the option that is on in a chip group, not its first chip', async () => {
    const user = userEvent.setup();
    render(
      <FilterBar
        value="finished"
        onChange={() => {}}
        active={[{ label: 'Status', value: 'Finished', clear: () => '' }]}
      >
        {(draft) => (
          <FilterField label="Status" stretch={false}>
            <div role="group" aria-label="Status">
              {['outstanding', 'finished'].map((status) => (
                <FilterChip
                  key={status}
                  label={status}
                  selected={draft === status}
                  onToggle={() => {}}
                />
              ))}
            </div>
          </FilterField>
        )}
      </FilterBar>
    );
    await user.click(screen.getByRole('button', { name: 'Change filter: Status: Finished' }));
    expect(screen.getByRole('button', { name: 'finished' })).toHaveFocus();
  });
});

describe('FilterBar inline key filter', () => {
  interface Value {
    space: string;
    unread: boolean;
  }
  const away: Value = { space: 'Lowsec', unread: true };

  function InlineHarness({ placement }: { placement?: 'row' | 'below' }) {
    const [value, setValue] = useState<Value>(away);
    const spaceField = (draft: Value, setDraft: (next: Value) => void) => (
      <FilterField label="Space">
        <TextInput
          aria-label="Space"
          value={draft.space}
          onChange={(e) => setDraft({ ...draft, space: e.target.value })}
        />
      </FilterField>
    );
    return (
      <>
        <FilterBar
          value={value}
          onChange={setValue}
          inline={spaceField}
          inlinePlacement={placement}
          active={[
            {
              label: 'Space',
              value: value.space,
              inline: true,
              clear: (v: Value) => ({ ...v, space: '' }),
            },
            { label: 'Unread only', clear: (v: Value) => ({ ...v, unread: false }) },
          ]}
        >
          {(draft, setDraft, surface) => (
            <>
              {surface === 'sheet' && spaceField(draft, setDraft)}
              <FilterChip
                label="Unread only"
                selected={draft.unread}
                onToggle={() => setDraft({ ...draft, unread: !draft.unread })}
              />
            </>
          )}
        </FilterBar>
        <p>{`space:${value.space} unread:${String(value.unread)}`}</p>
      </>
    );
  }

  it('shows the key filter in the row, with no pill and no count for it', () => {
    render(<InlineHarness />);
    expect(screen.getByRole('textbox', { name: 'Space' })).toHaveValue('Lowsec');
    expect(screen.queryByRole('button', { name: /Change filter: Space/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change filter: Unread only' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filters (1 active)' })).toBeInTheDocument();
  });

  it('does not repeat the key filter inside the open box', async () => {
    const user = userEvent.setup();
    render(<InlineHarness />);
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(screen.getAllByRole('textbox', { name: 'Space' })).toHaveLength(1);
  });

  it('clears the inline filter too with Clear all', async () => {
    const user = userEvent.setup();
    render(<InlineHarness />);
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.getByText('space: unread:false')).toBeInTheDocument();
  });

  it('puts it on a line under the row when asked', () => {
    render(<InlineHarness placement="below" />);
    const field = screen.getByRole('textbox', { name: 'Space' });
    const funnel = screen.getByRole('button', { name: /^Filters/ });
    expect(funnel.parentElement?.parentElement).not.toContainElement(field);
  });

  it('keeps a row-placed key filter in the box, with a pill and count, between md and lg', async () => {
    stubViewport(BELOW_DESKTOP_QUERY);
    const user = userEvent.setup();
    render(<InlineHarness />);
    expect(screen.queryByRole('textbox', { name: 'Space' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Change filter: Space: Lowsec' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(screen.getByRole('textbox', { name: 'Space' })).toBeInTheDocument();
  });

  it('keeps a below-placed key filter on its line between md and lg', () => {
    stubViewport(BELOW_DESKTOP_QUERY);
    render(<InlineHarness placement="below" />);
    expect(screen.getByRole('textbox', { name: 'Space' })).toBeInTheDocument();
  });

  it('moves it into the sheet, with its pill and count, on a phone', async () => {
    useNarrowViewport();
    const user = userEvent.setup();
    render(<InlineHarness />);
    expect(screen.queryByRole('textbox', { name: 'Space' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Change filter: Space: Lowsec' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(
      within(screen.getByRole('dialog')).getByRole('textbox', { name: 'Space' })
    ).toBeInTheDocument();
  });
});
