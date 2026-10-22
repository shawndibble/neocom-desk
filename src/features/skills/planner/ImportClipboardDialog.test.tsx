import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { ImportClipboardDialog } from './ImportClipboardDialog';
import type { ClipboardImportPreview } from './clipboardImport';

vi.mock('../typeCatalog', () => ({
  loadSkillNameMap: vi.fn(async () => new Map([['gunnery', { typeID: 3300 }]])),
  loadItemNameMap: vi.fn(async () => new Map()),
}));
vi.mock('../typeDetail', () => ({
  loadTypeDetail: vi.fn(async () => null),
}));

const FIXTURES = join(__dirname, '__fixtures__');

function planFile(): File {
  return new File([readFileSync(join(FIXTURES, 'sample-plan.emp'))], 'sample-plan.emp');
}

function cleanPlanFile(): File {
  return new File(
    [
      '<?xml version="1.0"?><plan name="p"><entry skillID="3300" skill="Gunnery" level="4" /></plan>',
    ],
    'clean.xml',
    { type: 'text/xml' }
  );
}

function renderDialog(initialPreview?: ClipboardImportPreview) {
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(
    <ImportClipboardDialog
      onApply={onApply}
      onClose={onClose}
      nameFor={(id) => (id === 3300 ? 'Gunnery' : `#${id}`)}
      trainedSkills={new Map()}
      initialPreview={initialPreview}
    />
  );
  return { onApply, onClose };
}

const GUNNERY_IV = { skillTypeID: 3300, targetLevel: 4 };

describe('ImportClipboardDialog', () => {
  it('is a textarea with a file link, Cancel and Import: no tabs, Parse or clipboard button', () => {
    renderDialog();
    expect(screen.getByLabelText(/paste an eft fit/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /choose a \.emp or \.xml file/i })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /parse|paste from clipboard/i })).toBeNull();
  });

  it('applies clean text on Import without showing a preview', async () => {
    const user = userEvent.setup();
    const { onApply } = renderDialog();
    await user.type(screen.getByLabelText(/paste an eft fit/i), 'Gunnery 4');
    await user.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith([GUNNERY_IV]));
    expect(screen.queryByText('Preview')).not.toBeInTheDocument();
  });

  it('Ctrl+Enter imports like the button', async () => {
    const user = userEvent.setup();
    const { onApply } = renderDialog();
    await user.type(screen.getByLabelText(/paste an eft fit/i), 'Gunnery 4{Control>}{Enter}');
    await waitFor(() => expect(onApply).toHaveBeenCalledWith([GUNNERY_IV]));
  });

  it('shows the preview, not an import, when some lines fail to parse', async () => {
    const user = userEvent.setup();
    const { onApply } = renderDialog();
    await user.type(screen.getByLabelText(/paste an eft fit/i), 'Gunnery 4{Enter}Not A Skill 4');
    await user.click(screen.getByRole('button', { name: 'Import' }));

    expect(await screen.findByText('Gunnery IV')).toBeInTheDocument();
    expect(screen.getByText(/^Line 2:/)).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith([GUNNERY_IV]);
  });

  it('announces the preview summary', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText(/paste an eft fit/i), 'Not A Skill 4');
    await user.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/1 errors?/i));
    expect(screen.getByRole('status')).toHaveClass('sr-only');
  });

  it('stays open with an inline error when nothing was found to import', () => {
    const { onApply, onClose } = renderDialog({
      mode: 'skillPlan',
      entries: [],
      warnings: [],
      errors: [],
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/nothing to import/i);
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('applies a picked plan file straight away when every entry reads', async () => {
    const user = userEvent.setup();
    const { onApply } = renderDialog();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, cleanPlanFile());
    await waitFor(() => expect(onApply).toHaveBeenCalledWith([GUNNERY_IV]));
  });

  it('previews a plan file with entries this catalog does not know', async () => {
    const user = userEvent.setup();
    const { onApply } = renderDialog();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, planFile());
    expect(await screen.findByText('Gunnery IV')).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
  });

  it('takes a plan file dropped on the dialog the same way', async () => {
    const { onApply } = renderDialog();
    fireEvent.drop(screen.getByLabelText(/paste an eft fit/i), {
      dataTransfer: { files: [cleanPlanFile()] },
    });
    await waitFor(() => expect(onApply).toHaveBeenCalledWith([GUNNERY_IV]));
  });

  it('a malformed file surfaces the translated inline error instead of throwing', async () => {
    const user = userEvent.setup();
    const { onApply } = renderDialog();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const truncated = new File(
      ['<?xml version="1.0"?><plan><entry skill="Gunnery" level="4"'],
      'truncated.xml',
      { type: 'text/xml' }
    );
    await user.upload(input, truncated);

    await waitFor(() => expect(screen.getByText(/malformed or truncated/i)).toBeInTheDocument());
    expect(onApply).not.toHaveBeenCalled();
  });
});
