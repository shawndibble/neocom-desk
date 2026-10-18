// @vitest-environment jsdom
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import '@/i18n';
import { BootUpdateGate } from './BootUpdateGate';
import { resetBootUpdateForTest } from './bootUpdateOnce';
import type { BootUpdateOutcome } from './bootUpdate';
import { deferred } from '@/test/deferred';

const { runBootUpdate, bootUpdateMayHold } = vi.hoisted(() => ({
  runBootUpdate: vi.fn(),
  bootUpdateMayHold: vi.fn(() => true),
}));
vi.mock('./bootUpdate', () => ({ runBootUpdate, bootUpdateMayHold }));
vi.mock('./bootRecovery', () => ({ recoverFromStalledBoot: vi.fn() }));
vi.mock('./bootStallReport', () => ({
  reportBootStallOnce: vi.fn(),
  reportBootStallResolved: vi.fn(),
}));

function renderGate(strict = false) {
  const tree = (
    <BootUpdateGate>
      <p>the app</p>
    </BootUpdateGate>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

beforeEach(() => {
  runBootUpdate.mockReset();
  bootUpdateMayHold.mockReset();
  bootUpdateMayHold.mockReturnValue(true);
  resetBootUpdateForTest();
});

describe('BootUpdateGate', () => {
  it('shows the boot screen while pending, then the children', async () => {
    const d = deferred<BootUpdateOutcome>();
    runBootUpdate.mockReturnValue(d.promise);
    renderGate();
    expect(screen.getByText('Neocom Desk')).toBeInTheDocument();
    expect(screen.queryByText('the app')).not.toBeInTheDocument();
    await act(async () => d.resolve('current'));
    expect(screen.getByText('the app')).toBeInTheDocument();
  });

  it.each(['skipped', 'current'] as const)('renders children on %s', async (outcome) => {
    runBootUpdate.mockResolvedValue(outcome);
    renderGate();
    expect(await screen.findByText('the app')).toBeInTheDocument();
  });

  it('renders the children on the first frame when nothing could be waited for', () => {
    bootUpdateMayHold.mockReturnValue(false);
    runBootUpdate.mockReturnValue(new Promise(() => {}));
    renderGate();
    expect(screen.getByText('the app')).toBeInTheDocument();
  });

  it('stays on the boot screen while applying', async () => {
    runBootUpdate.mockResolvedValue('applying');
    renderGate();
    await act(async () => {});
    expect(screen.queryByText('the app')).not.toBeInTheDocument();
    expect(screen.getByText('Neocom Desk')).toBeInTheDocument();
  });

  it('falls through to the children if the update rejects', async () => {
    runBootUpdate.mockRejectedValue(new Error('boom'));
    renderGate();
    expect(await screen.findByText('the app')).toBeInTheDocument();
  });

  it('runs the boot update once under StrictMode', async () => {
    runBootUpdate.mockResolvedValue('current');
    renderGate(true);
    expect(await screen.findByText('the app')).toBeInTheDocument();
    expect(runBootUpdate).toHaveBeenCalledTimes(1);
  });
});
