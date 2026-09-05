import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { NARROW_QUERY } from '@/lib/useIsNarrow';
import { FilterBar, FilterField } from './FilterBar';
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
 * a pointer viewport — so the inline row is what every route test sees by
 * default. Narrow has to be asked for.
 */
let restoreMatchMedia: (() => void) | undefined;

function useNarrowViewport(): void {
  const real = window.matchMedia;
  window.matchMedia = (media: string) =>
    ({
      media,
      matches: media === NARROW_QUERY,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  restoreMatchMedia = () => {
    window.matchMedia = real;
  };
}

afterEach(() => {
  restoreMatchMedia?.();
  restoreMatchMedia = undefined;
});

function Harness({ initial = EMPTY }: { initial?: Filter }) {
  const [filter, setFilter] = useState(initial);
  const activeCount = (filter.unreadOnly ? 1 : 0) + (filter.from === '' ? 0 : 1);
  return (
    <>
      <FilterBar
        value={filter}
        onChange={setFilter}
        activeCount={activeCount}
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
  it('renders the controls inline on a pointer viewport, with no trigger', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Unread only' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Filters/ })).not.toBeInTheDocument();
  });

  it('commits an inline edit immediately', async () => {
    const user = userEvent.setup();
    render(<Harness />);
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

  it('applies sheet edits only on Apply', async () => {
    useNarrowViewport();
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByRole('button', { name: 'Unread only' }));
    expect(screen.getByText('unread:false from:')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByText('unread:true from:')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('throws sheet edits away on Cancel, and does not restore them on reopen', async () => {
    useNarrowViewport();
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByRole('button', { name: 'Unread only' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('unread:false from:')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByRole('button', { name: 'Unread only' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
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

  it('captions each field in the sheet only', async () => {
    render(<Harness />);
    expect(screen.queryByText('From')).not.toBeInTheDocument();

    restoreMatchMedia?.();
    useNarrowViewport();
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getAllByRole('button', { name: 'Filters' })[0]!);
    expect(screen.getByText('From')).toBeInTheDocument();
  });
});
