// @vitest-environment jsdom
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import '@/i18n';
import { BootUpdateGate } from './BootUpdateGate';
import { resetBootUpdateForTest } from './bootUpdateOnce';
import type { BootUpdateOutcome } from './bootUpdate';

const { runBootUpdate } = vi.hoisted(() => ({ runBootUpdate: vi.fn() }));
vi.mock('./bootUpdate', () => ({ runBootUpdate }));
vi.mock('./bootRecovery', () => ({ recoverFromStalledBoot: vi.fn() }));
vi.mock('./bootStallReport', () => ({
  reportBootStallOnce: vi.fn(),
  reportBootStallResolved: vi.fn(),
}));

function deferred() {
  let resolve!: (v: BootUpdateOutcome) => void;
  const promise = new Promise<BootUpdateOutcome>((r) => (resolve = r));
  return { promise, resolve };
}

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
  resetBootUpdateForTest();
});

describe('BootUpdateGate', () => {
  it('shows the boot screen while pending, then the children', async () => {
    const d = deferred();
    runBootUpdate.mockReturnValue(d.promise);
    renderGate();
    expect(screen.getByText('Neocom Desk')).toBeInTheDocument();
    expect(screen.queryByText('the app')).not.toBeInTheDocument();
    await act(async () => d.resolve('current'));
    expect(screen.getByText('the app')).toBeInTheDocument();
  });

  it.each(['skipped', 'timed-out'] as const)('renders children on %s', async (outcome) => {
    runBootUpdate.mockResolvedValue(outcome);
    renderGate();
    expect(await screen.findByText('the app')).toBeInTheDocument();
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
