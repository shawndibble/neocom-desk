import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { MilestoneModal } from './MilestoneModal';

function renderModal(overrides: Partial<Parameters<typeof MilestoneModal>[0]> = {}) {
  const onClose = vi.fn();
  const onSave = vi.fn();
  render(<MilestoneModal open onClose={onClose} onSave={onSave} {...overrides} />);
  return { onClose, onSave };
}

describe('MilestoneModal', () => {
  it('starts blank when adding, and saves the trimmed name', async () => {
    const user = userEvent.setup();
    const { onSave, onClose } = renderModal();

    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('');
    await user.type(input, '  Fly Loki  ');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(onSave).toHaveBeenCalledWith('Fly Loki');
    expect(onClose).toHaveBeenCalled();
  });

  it('seeds the field with the existing name when renaming', () => {
    renderModal({ initialName: 'T2 guns' });
    expect(screen.getByRole('textbox')).toHaveValue('T2 guns');
  });

  it('disables Save for a blank or whitespace-only name', async () => {
    const user = userEvent.setup();
    renderModal();
    const save = screen.getByRole('button', { name: /save/i });
    expect(save).toBeDisabled();

    await user.type(screen.getByRole('textbox'), '   ');
    expect(save).toBeDisabled();
  });

  it('saves on Enter', async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();
    await user.type(screen.getByRole('textbox'), 'Command Ships{Enter}');
    expect(onSave).toHaveBeenCalledWith('Command Ships');
  });

  it('re-seeds a fresh draft each time it reopens, rather than keeping the last one', () => {
    const { rerender } = render(
      <MilestoneModal open={false} initialName="Fly Loki" onClose={vi.fn()} onSave={vi.fn()} />
    );
    rerender(<MilestoneModal open initialName="Fly Loki" onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveValue('Fly Loki');
  });
});
