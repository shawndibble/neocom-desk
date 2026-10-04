import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import type { SolarSystemEntry } from '@/sde/marketTypes';
import { AnsiblexGatesDialog } from './AnsiblexGatesDialog';

const ONE_DQ = 30004759;
const J5A = 30004760;
const JITA = 30000142;

const SYSTEMS = new Map<number, SolarSystemEntry>([
  [ONE_DQ, { id: ONE_DQ, name: '1DQ1-A', security: -0.38, regionId: 10000060 }],
  [J5A, { id: J5A, name: 'J5A-IX', security: -0.2, regionId: 10000060 }],
  [JITA, { id: JITA, name: 'Jita', security: 0.95, regionId: 10000002 }],
]);

beforeEach(async () => {
  await db.ansiblexGates.clear();
  await db.characters.clear();
});

describe('AnsiblexGatesDialog', () => {
  it('adds pasted gates on this device, and lists back the lines it could not read', async () => {
    render(<AnsiblexGatesDialog mode="paste" systems={SYSTEMS} onClose={() => {}} />);

    await userEvent.click(screen.getByRole('textbox', { name: 'Ansiblex gates, one per line' }));
    await userEvent.paste('1DQ1-A » J5A-IX - Delve Highway\nJ5A-IX » Nowhere\nJita » 1DQ1-A');
    await userEvent.click(screen.getByRole('button', { name: 'Add gates' }));

    expect(await screen.findByText('Added 1 gate.')).toBeInTheDocument();
    expect(screen.getByText('Line 2: no system named Nowhere.')).toBeInTheDocument();
    expect(
      screen.getByText("Line 3: Jita isn't in nullsec, where Ansiblex stand.")
    ).toBeInTheDocument();
    expect(await db.ansiblexGates.toArray()).toEqual([
      expect.objectContaining({
        fromId: ONE_DQ,
        toId: J5A,
        name: '1DQ1-A » J5A-IX - Delve Highway',
        source: 'paste',
      }),
    ]);
    expect(await screen.findByText('1 gate known')).toBeInTheDocument();
  });

  it('removes a gate from the list', async () => {
    await db.ansiblexGates.put({
      id: `paste:${ONE_DQ}:${J5A}`,
      fromId: ONE_DQ,
      toId: J5A,
      name: '1DQ1-A » J5A-IX',
      source: 'paste',
      foundBy: [],
      savedAt: 1,
    });
    render(<AnsiblexGatesDialog mode="list" systems={SYSTEMS} onClose={() => {}} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Remove 1DQ1-A » J5A-IX' }));

    await waitFor(async () => expect(await db.ansiblexGates.count()).toBe(0));
    expect(await screen.findByText('No gates known yet.')).toBeInTheDocument();
  });
});
