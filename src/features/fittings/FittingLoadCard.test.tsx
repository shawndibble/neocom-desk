import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { FittingXmlListItem } from './useFittingWorkspace';
import { FittingLoadCard } from './FittingLoadCard';

const SINGLE_FIT = `<?xml version="1.0"?>
<fittings>
  <fitting name="[Rifter, Solo PVP]">
    <shipType value="Rifter" />
  </fitting>
</fittings>`;

const MULTI_FIT = `<?xml version="1.0"?>
<fittings>
  <fitting name="[Rifter, Solo PVP]">
    <shipType value="Rifter" />
  </fitting>
  <fitting name="[Not A Ship, Broken]">
    <shipType value="Not A Ship" />
  </fitting>
</fittings>`;

const RESOLVED: FittingXmlListItem = {
  name: '[Rifter, Solo PVP]',
  hullTypeId: 587,
  hullName: 'Rifter',
  hullError: null,
  unresolved: [],
  fitting: { name: '[Rifter, Solo PVP]', shipTypeId: 587, modules: [], drones: [], cargo: [] },
};

const UNRESOLVED: FittingXmlListItem = {
  name: '[Not A Ship, Broken]',
  hullTypeId: null,
  hullName: null,
  hullError: 'unknown ship',
  unresolved: [{ text: 'Not A Ship', reason: 'unknown ship' }],
  fitting: null,
};

function renderCard(onLoadFittingXmlDocument: () => Promise<FittingXmlListItem[]>) {
  const onOpenFittingXmlEntry = vi.fn().mockResolvedValue(undefined);
  render(
    <FittingLoadCard
      onLoad={vi.fn()}
      unresolved={[]}
      fitXmlUnresolved={[]}
      shareError={null}
      tooLargeToShare={false}
      onLoadFittingXmlDocument={onLoadFittingXmlDocument}
      onOpenFittingXmlEntry={onOpenFittingXmlEntry}
    />
  );
  return { onOpenFittingXmlEntry };
}

async function pickFile(text: string, name = 'fit.xml') {
  const file = new File([text], name, { type: 'text/xml' });
  const input = screen.getByLabelText(/fittings file/i);
  await userEvent.upload(input, file);
}

describe('FittingLoadCard — Loaded EVE-XML fittings file (#1542)', () => {
  it('opens a single-fit export directly, without showing the picker list', async () => {
    const { onOpenFittingXmlEntry } = renderCard(async () => [RESOLVED]);
    await pickFile(SINGLE_FIT);

    await waitFor(() => expect(onOpenFittingXmlEntry).toHaveBeenCalledWith(RESOLVED));
    expect(screen.queryByText(/nothing here is saved/i)).not.toBeInTheDocument();
  });

  it('shows a temporary, unsaved picker list for a multi-fit export', async () => {
    const { onOpenFittingXmlEntry } = renderCard(async () => [RESOLVED, UNRESOLVED]);
    await pickFile(MULTI_FIT);

    await waitFor(() => expect(screen.getByText(/nothing here is saved/i)).toBeInTheDocument());
    expect(onOpenFittingXmlEntry).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /open \[rifter, solo pvp\]/i }));
    expect(onOpenFittingXmlEntry).toHaveBeenCalledWith(RESOLVED);
  });

  it("reports a malformed entry's own reason without an Open control, alongside the rest of the list", async () => {
    renderCard(async () => [RESOLVED, UNRESOLVED]);
    await pickFile(MULTI_FIT);

    await waitFor(() => expect(screen.getByText(/\[not a ship, broken\]/i)).toBeInTheDocument());
    expect(screen.getByText(/unknown ship/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /open \[not a ship, broken\]/i })
    ).not.toBeInTheDocument();
  });

  it("shows the single entry's own error instead of opening nothing when a single-fit export fails to resolve", async () => {
    const { onOpenFittingXmlEntry } = renderCard(async () => [UNRESOLVED]);
    await pickFile(SINGLE_FIT);

    await waitFor(() => expect(screen.getByText(/unknown ship/i)).toBeInTheDocument());
    expect(onOpenFittingXmlEntry).not.toHaveBeenCalled();
  });
});
