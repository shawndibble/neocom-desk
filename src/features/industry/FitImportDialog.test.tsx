import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import { FitImportDialog } from './FitImportDialog';

const BUZZARD_BP = 11194;
const BUZZARD = 11192;

function bpEntry(
  blueprintTypeID: number,
  productTypeID: number,
  productName: string
): BlueprintCatalogEntry {
  return {
    blueprintTypeID,
    blueprint: {
      name: `${productName} Blueprint`,
      time: 100,
      materials: [],
      products: [{ typeID: productTypeID, quantity: 1 }],
      skills: [],
      activity: 'manufacturing',
    },
    productTypeID,
    productName,
    productNameLower: productName.toLowerCase(),
  };
}

const ENTRIES = [bpEntry(BUZZARD_BP, BUZZARD, 'Buzzard')];

const CATALOG: BlueprintCatalog = {
  entries: ENTRIES,
  byBlueprintTypeID: new Map(ENTRIES.map((e) => [e.blueprintTypeID, e])),
  byProductTypeID: new Map(ENTRIES.map((e) => [e.productTypeID as number, e])),
  typesById: {
    [BUZZARD]: { name: 'Buzzard', groupID: 830, volume: 19400 },
    // A faction module: has a name in the SDE but nothing produces it.
    2000: { name: 'Sisters Core Probe Launcher', groupID: 481, volume: 5 },
  },
};

const FIT_TEXT = '[Buzzard, Scout]\n\nSisters Core Probe Launcher';

describe('FitImportDialog — initialText', () => {
  it('pre-fills the textarea and shows the preview without pressing Parse', async () => {
    render(
      <FitImportDialog
        catalog={CATALOG}
        onApply={vi.fn()}
        onClose={vi.fn()}
        initialText={FIT_TEXT}
      />
    );
    expect(screen.getByLabelText(/paste/i)).toHaveValue(FIT_TEXT);
    // The hull is buildable, the faction module is not — both already
    // visible with no click, as if the pilot had pasted and pressed Parse.
    expect(await screen.findByText('Buzzard x1')).toBeInTheDocument();
    expect(screen.getByText('Sisters Core Probe Launcher x1')).toBeInTheDocument();
  });

  it('still lets the pilot edit the pre-filled text and re-parse', async () => {
    const user = userEvent.setup();
    render(
      <FitImportDialog
        catalog={CATALOG}
        onApply={vi.fn()}
        onClose={vi.fn()}
        initialText={FIT_TEXT}
      />
    );
    const textarea = screen.getByLabelText(/paste/i);
    fireEvent.change(textarea, { target: { value: '[Buzzard, Scout]' } });
    await user.click(screen.getByRole('button', { name: 'Read fit' }));
    expect(screen.queryByText(/Sisters Core Probe Launcher/)).not.toBeInTheDocument();
  });

  it('opens empty with no preview when nothing seeded it', () => {
    render(<FitImportDialog catalog={CATALOG} onApply={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByLabelText(/paste/i)).toHaveValue('');
    expect(screen.queryByText(/Buzzard/)).not.toBeInTheDocument();
  });
});
