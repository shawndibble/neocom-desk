import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { LoadOutcome } from '@/engine/fittings/load';
import type { FittingXmlListItem } from './useFittingWorkspace';
import { FittingLoadCard, LoadWarnings } from './FittingLoadCard';

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
  hullName: 'Rifter',
  load: {
    kind: 'fitting',
    source: 'file',
    fitting: { name: '[Rifter, Solo PVP]', shipTypeId: 587, modules: [], drones: [], cargo: [] },
    unresolved: [],
  },
};

const UNRESOLVED: FittingXmlListItem = {
  name: '[Not A Ship, Broken]',
  hullName: null,
  load: {
    kind: 'failed',
    source: 'file',
    error: null,
    unresolved: [{ text: 'Not A Ship', reason: 'unknown ship' }],
  },
};

function renderCard(onLoadFittingXmlDocument: () => Promise<FittingXmlListItem[]>) {
  const onOpenLoaded = vi.fn().mockResolvedValue(undefined);
  render(
    <FittingLoadCard
      onLoad={vi.fn()}
      lastLoad={null}
      shareError={null}
      tooLargeToShare={false}
      onLoadFittingXmlDocument={onLoadFittingXmlDocument}
      onOpenLoaded={onOpenLoaded}
    />
  );
  return { onOpenLoaded };
}

async function pickFile(text: string, name = 'fit.xml') {
  const file = new File([text], name, { type: 'text/xml' });
  const input = screen.getByLabelText(/fittings file/i);
  await userEvent.upload(input, file);
}

describe('FittingLoadCard — Loaded EVE-XML fittings file (#1542)', () => {
  it('opens a single-fit export directly, without showing the picker list', async () => {
    const { onOpenLoaded } = renderCard(async () => [RESOLVED]);
    await pickFile(SINGLE_FIT);

    await waitFor(() => expect(onOpenLoaded).toHaveBeenCalledWith(RESOLVED.load));
    expect(screen.queryByText(/nothing here is saved/i)).not.toBeInTheDocument();
  });

  it('shows a temporary, unsaved picker list for a multi-fit export', async () => {
    const { onOpenLoaded } = renderCard(async () => [RESOLVED, UNRESOLVED]);
    await pickFile(MULTI_FIT);

    await waitFor(() => expect(screen.getByText(/nothing here is saved/i)).toBeInTheDocument());
    expect(onOpenLoaded).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /open \[rifter, solo pvp\]/i }));
    expect(onOpenLoaded).toHaveBeenCalledWith(RESOLVED.load);
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
    const { onOpenLoaded } = renderCard(async () => [UNRESOLVED]);
    await pickFile(SINGLE_FIT);

    await waitFor(() => expect(screen.getByText(/unknown ship/i)).toBeInTheDocument());
    expect(onOpenLoaded).not.toHaveBeenCalled();
  });
});

describe('LoadWarnings', () => {
  it("words a text Load's warnings by line, and an In-game Fitting's by item, one list per Load", () => {
    const text: LoadOutcome = {
      kind: 'failed',
      source: 'text',
      error: null,
      unresolved: [{ line: 1, text: 'Not A Ship', reason: 'unknown ship' }],
    };
    const { rerender } = render(<LoadWarnings load={text} />);
    expect(screen.getByText("1 line wasn't recognized")).toBeInTheDocument();
    expect(screen.getByText('Line 1: "Not A Ship" — unknown ship')).toBeInTheDocument();

    const inGame: LoadOutcome = {
      kind: 'fitting',
      source: 'in-game',
      fitting: { name: 'Carrier', shipTypeId: 23757, modules: [], drones: [], cargo: [] },
      unresolved: [{ text: 'FighterBay', reason: 'unsupported slot' }],
    };
    rerender(<LoadWarnings load={inGame} />);
    expect(
      screen.getByText("1 item couldn't be loaded (fighter bay or service slot)")
    ).toBeInTheDocument();
    expect(screen.getByText('"FighterBay" — unsupported slot')).toBeInTheDocument();
    expect(screen.queryByText(/Not A Ship/)).not.toBeInTheDocument();
  });
});
