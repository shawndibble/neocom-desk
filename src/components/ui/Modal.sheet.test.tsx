import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { stubViewport } from '@/test/viewport';
import { Modal, type ModalPlacement } from './Modal';

const overlayEntry = () =>
  (window.history.state as Record<string, unknown> | null)?.['__neocomOverlay'];

function SheetHarness({
  placement = 'sheet',
  closeOnBack,
}: {
  placement?: ModalPlacement;
  closeOnBack?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Filters"
        placement={placement}
        closeOnBack={closeOnBack}
      >
        <button type="button">Inside</button>
      </Modal>
    </>
  );
}

/** The grabber-plus-header drag zone: the header's parent. */
const dragZone = () => screen.getByRole('banner', { hidden: true }).parentElement!;

/** Press, drag `dy` px down in two steps, release; the clock is stubbed so velocity is deterministic. */
function swipe(zone: Element, dy: number, elapsedMs: number) {
  let now = 1000;
  const spy = vi.spyOn(performance, 'now').mockImplementation(() => now);
  fireEvent.pointerDown(zone, { clientY: 100, pointerId: 1 });
  now += elapsedMs / 2;
  fireEvent.pointerMove(zone, { clientY: 100 + dy / 2, pointerId: 1 });
  now += elapsedMs / 2;
  fireEvent.pointerMove(zone, { clientY: 100 + dy, pointerId: 1 });
  fireEvent.pointerUp(zone, { clientY: 100 + dy, pointerId: 1 });
  spy.mockRestore();
}

afterEach(async () => {
  cleanup();
  // Let each test's deferred history cleanup land before the next one starts.
  await waitFor(() => expect(overlayEntry()).toBeUndefined());
  window.history.replaceState(null, '');
});

describe('Modal bottom sheet', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows a grabber on a sheet', async () => {
    const user = userEvent.setup();
    const { container } = render(<SheetHarness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(container.querySelector('dialog span.rounded-full')).not.toBeNull();
  });

  it('shows no grabber on a centered dialog', async () => {
    const user = userEvent.setup();
    const { container } = render(<SheetHarness placement="center" />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(container.querySelector('dialog span.rounded-full')).toBeNull();
  });

  it('dismisses on a swipe down past the distance threshold', async () => {
    const user = userEvent.setup();
    render(<SheetHarness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    swipe(dragZone(), 120, 1000);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Inside' })).not.toBeInTheDocument()
    );
  });

  it('dismisses on a fast flick shorter than the distance threshold', async () => {
    const user = userEvent.setup();
    render(<SheetHarness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    swipe(dragZone(), 40, 40);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Inside' })).not.toBeInTheDocument()
    );
  });

  it('slides the sheet off the bottom before it closes', async () => {
    const user = userEvent.setup();
    render(<SheetHarness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    swipe(dragZone(), 120, 1000);
    expect(screen.getByRole('button', { name: 'Inside' })).toBeInTheDocument();
    expect(screen.getByRole('dialog').style.transform).toBe('translateY(100%)');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Inside' })).not.toBeInTheDocument()
    );
  });

  it('does not close a second time when a close lands during the slide', async () => {
    const closes = vi.fn();
    function Counting() {
      const [open, setOpen] = useState(true);
      return (
        <Modal
          open={open}
          onClose={() => {
            closes();
            setOpen(false);
          }}
          title="Filters"
          placement="sheet"
        >
          <button type="button">Inside</button>
        </Modal>
      );
    }
    render(<Counting />);
    swipe(dragZone(), 120, 1000);
    // Escape (or a tap on the backdrop) while the sheet is still sliding off.
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(closes).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 320));
    expect(closes).toHaveBeenCalledTimes(1);
  });

  it('closes at once under reduced motion', async () => {
    const restore = stubViewport((query) => query.includes('prefers-reduced-motion'));
    try {
      const user = userEvent.setup();
      render(<SheetHarness />);
      await user.click(screen.getByRole('button', { name: 'Open' }));
      swipe(dragZone(), 120, 1000);
      expect(screen.queryByRole('button', { name: 'Inside' })).not.toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('opens in place again after a swipe sent it off the bottom', async () => {
    const user = userEvent.setup();
    render(<SheetHarness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    swipe(dragZone(), 120, 1000);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Inside' })).not.toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('dialog').style.transform).toBe('');
  });

  it('ignores velocity from a flick that was then held still', async () => {
    const user = userEvent.setup();
    render(<SheetHarness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const zone = dragZone();
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    fireEvent.pointerDown(zone, { clientY: 100, pointerId: 1 });
    now += 20;
    fireEvent.pointerMove(zone, { clientY: 140, pointerId: 1 });
    now += 500;
    fireEvent.pointerUp(zone, { clientY: 140, pointerId: 1 });
    expect(screen.getByRole('button', { name: 'Inside' })).toBeInTheDocument();
  });

  it('snaps back on a short, slow swipe', async () => {
    const user = userEvent.setup();
    render(<SheetHarness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    swipe(dragZone(), 30, 1000);
    expect(screen.getByRole('button', { name: 'Inside' })).toBeInTheDocument();
    expect(screen.getByRole('dialog').style.transform).toBe('');
  });

  it('closes on Back, and a close by the close button leaves no history entry behind', async () => {
    const user = userEvent.setup();
    render(<SheetHarness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(overlayEntry()).toBeTruthy();

    act(() => window.history.back());
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Inside' })).not.toBeInTheDocument()
    );
    expect(overlayEntry()).toBeUndefined();

    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(overlayEntry()).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(overlayEntry()).toBeUndefined());
  });

  it('pushes no history entry when the modal opts out', async () => {
    const user = userEvent.setup();
    render(<SheetHarness placement="center" closeOnBack={false} />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(overlayEntry()).toBeUndefined();
  });
});
