import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { ImportClipboardDialog } from './ImportClipboardDialog';

vi.mock('../typeCatalog', () => ({
  loadSkillNameMap: vi.fn(async () => new Map([['gunnery', { typeID: 3300 }]])),
  loadItemNameMap: vi.fn(async () => new Map()),
}));
vi.mock('../data', () => ({
  loadUniverseType: vi.fn(async () => null),
}));

const FIXTURES = join(__dirname, '__fixtures__');

function planFile(): File {
  return new File([readFileSync(join(FIXTURES, 'sample-plan.emp'))], 'sample-plan.emp');
}

function renderDialog() {
  return render(
    <ImportClipboardDialog
      onApply={vi.fn()}
      onClose={vi.fn()}
      nameFor={(id) => (id === 3300 ? 'Gunnery' : `#${id}`)}
      trainedSkills={new Map()}
    />
  );
}

describe('ImportClipboardDialog', () => {
  it('defaults to the Paste tab', () => {
    renderDialog();
    expect(screen.getByLabelText(/paste an eft fit/i)).toBeInTheDocument();
  });

  it('switching to the File tab shows the drop zone and file picker button', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('tab', { name: 'File' }));
    expect(screen.getByText(/drop a \.emp or \.xml file here/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeInTheDocument();
  });

  it('picking a file through the file input previews its parsed entries', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('tab', { name: 'File' }));

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, planFile());

    await waitFor(() => expect(screen.getByText('Gunnery IV')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
  });

  it('dropping a file onto the drop zone wires to the same preview pipeline', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('tab', { name: 'File' }));

    const dropZone = screen.getByText(/drop a \.emp or \.xml file here/i).closest('div')!;
    fireEvent.drop(dropZone, { dataTransfer: { files: [planFile()] } });

    await waitFor(() => expect(screen.getByText('Gunnery IV')).toBeInTheDocument());
  });

  it('a malformed file surfaces the translated inline error instead of throwing', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('tab', { name: 'File' }));

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const truncated = new File(
      ['<?xml version="1.0"?><plan><entry skill="Gunnery" level="4"'],
      'truncated.xml',
      { type: 'text/xml' }
    );
    await user.upload(input, truncated);

    await waitFor(() => expect(screen.getByText(/malformed or truncated/i)).toBeInTheDocument());
  });
});
