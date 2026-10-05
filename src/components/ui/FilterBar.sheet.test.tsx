import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { NARROW_QUERY } from '@/lib/useIsNarrow';
import { FilterBar } from './FilterBar';
import { FilterChip } from './FilterChip';

interface Filter {
  unreadOnly: boolean;
}

const overlayEntry = () =>
  (window.history.state as Record<string, unknown> | null)?.['__neocomOverlay'];

/** jsdom's `matchMedia` never matches; the bottom sheet needs the narrow query to. */
const realMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = realMatchMedia;
});

function Harness() {
  const [filter, setFilter] = useState<Filter>({ unreadOnly: false });
  return (
    <>
      <FilterBar value={filter} onChange={setFilter} activeCount={filter.unreadOnly ? 1 : 0}>
        {(draft, setDraft) => (
          <FilterChip
            label="Unread only"
            selected={draft.unreadOnly}
            onToggle={() => setDraft({ unreadOnly: !draft.unreadOnly })}
          />
        )}
      </FilterBar>
      <p>{`unread:${String(filter.unreadOnly)}`}</p>
    </>
  );
}

async function openSheet() {
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
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Filters' }));
  return { user, dialog: screen.getByRole('dialog') };
}

afterEach(async () => {
  cleanup();
  // Let each test's deferred history cleanup land before the next one starts.
  await waitFor(() => expect(overlayEntry()).toBeUndefined());
  window.history.replaceState(null, '');
});

describe('FilterBar sheet dismissal', () => {
  it('closes at once on a backdrop tap when the draft is unchanged', async () => {
    const { user, dialog } = await openSheet();
    await user.click(dialog);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks before discarding on a backdrop tap when the draft changed', async () => {
    const { user, dialog } = await openSheet();
    await user.click(screen.getByRole('button', { name: 'Unread only' }));
    await user.click(dialog);

    expect(screen.getByText('Discard filter changes?', { selector: 'p' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('button', { name: 'Unread only' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('unread:false')).toBeInTheDocument();
  });

  it('asks on the close button too, and Escape on the prompt keeps editing', async () => {
    const { user } = await openSheet();
    await user.click(screen.getByRole('button', { name: 'Unread only' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Unread only' })).toBeInTheDocument();
  });

  it('keeps the sheet and puts its history entry back when Back is pressed over a changed draft', async () => {
    const { user } = await openSheet();
    await user.click(screen.getByRole('button', { name: 'Unread only' }));
    act(() => window.history.back());
    await screen.findByRole('button', { name: 'Keep editing' });
    await waitFor(() =>
      expect(
        (window.history.state as Record<string, unknown> | null)?.['__neocomOverlay']
      ).toBeTruthy()
    );
  });

  it('Cancel discards without asking', async () => {
    const { user } = await openSheet();
    await user.click(screen.getByRole('button', { name: 'Unread only' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('unread:false')).toBeInTheDocument();
  });

  it('pads the Apply bar by the safe-area inset', async () => {
    await openSheet();
    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply.parentElement?.className).toContain('env(safe-area-inset-bottom)');
  });
});
