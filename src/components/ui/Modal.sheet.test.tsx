import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
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
    expect(screen.queryByRole('button', { name: 'Inside' })).not.toBeInTheDocument();
  });

  it('dismisses on a fast flick shorter than the distance threshold', async () => {
    const user = userEvent.setup();
    render(<SheetHarness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    swipe(dragZone(), 40, 40);
    expect(screen.queryByRole('button', { name: 'Inside' })).not.toBeInTheDocument();
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
