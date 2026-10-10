import { createRef } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import '@/i18n';
import { db } from '@/db';
import { StructureFeeLine } from './StructureFeeLine';
import { SYNCED_STRUCTURE_FEES_KEY, useStructureFees } from './structureFees';
import { StructureFeesList } from './StructureFeesList';

beforeEach(async () => {
  await db.settings.clear();
  useStructureFees.setState({ value: {}, hydrated: false });
});

describe('StructureFeeLine', () => {
  it('says the NPC fees are assumed until a fee is set, then shows the fee', async () => {
    render(<StructureFeeLine structureId={1000000000001} gross={2_640_000} accountingLevel={5} />);
    expect(await screen.findByText('Assuming NPC station fees')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Set fee…' }));
    fireEvent.change(await screen.findByLabelText("Owner's broker fee (%)"), {
      target: { value: '2' },
    });
    expect(screen.getByText(/2\.5% total broker fee/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Broker fee 2.5% (you set this)')).toBeTruthy();
    expect(screen.queryByText('Assuming NPC station fees')).toBeNull();
    expect(useStructureFees.getState().value).toEqual({ 1000000000001: 2 });
  });

  it('keeps an explicit 0% owner fee as a set fee', async () => {
    await db.settings.put({ key: SYNCED_STRUCTURE_FEES_KEY, value: { 1000000000001: 0 } });
    render(<StructureFeeLine structureId={1000000000001} gross={1000} accountingLevel={5} />);
    expect(await screen.findByText('Broker fee 0.5% (you set this)')).toBeTruthy();
  });
});

describe('StructureFeesList', () => {
  it('renders nothing while no fee is set', async () => {
    const { container } = render(<StructureFeesList />);
    await waitFor(() => expect(useStructureFees.getState().hydrated).toBe(true));
    expect(container.textContent).toBe('');
  });

  it('lists a set fee and removes it', async () => {
    await db.settings.put({ key: SYNCED_STRUCTURE_FEES_KEY, value: { 1000000000001: 2.5 } });
    render(<StructureFeesList />);
    expect(await screen.findByText(/3% broker fee/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Remove fee for/ }));
    await waitFor(() => expect(useStructureFees.getState().value).toEqual({}));
    expect(screen.queryByText(/Unknown Structure/)).toBeNull();
  });

  it('hands focus to a neighbouring Remove, then the panel heading, as fees go (issue #3365)', async () => {
    await db.settings.put({
      key: SYNCED_STRUCTURE_FEES_KEY,
      value: { 1000000000001: 2.5, 1000000000002: 3 },
    });
    const heading = createRef<HTMLHeadingElement>();
    render(
      <>
        <h2 ref={heading} tabIndex={-1}>
          Market
        </h2>
        <StructureFeesList panelHeading={heading} />
      </>
    );
    const first = await screen.findByRole('button', { name: /Remove fee for .*#1000000000001/ });
    fireEvent.click(first);
    const last = await screen.findByRole('button', { name: /Remove fee for .*#1000000000002/ });
    await waitFor(() => expect(document.activeElement).toBe(last));
    fireEvent.click(last);
    await waitFor(() => expect(document.activeElement).toBe(heading.current));
  });
});
