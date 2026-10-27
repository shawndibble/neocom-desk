import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { Attributes } from '@/engine/types';
import { RemapMarkerModal } from './RemapMarkerModal';

/** A legal sheet (sums to 99, every value in 17..27) other than BASELINE. */
const OVERRIDE: Attributes = {
  intelligence: 17,
  memory: 17,
  perception: 27,
  willpower: 21,
  charisma: 17,
};

/** Another legal sheet, distinct from both OVERRIDE and BASELINE. */
const COMPUTED: Attributes = {
  intelligence: 19,
  memory: 19,
  perception: 24,
  willpower: 20,
  charisma: 17,
};

const BASELINE: Attributes = {
  intelligence: 20,
  memory: 20,
  perception: 20,
  willpower: 20,
  charisma: 19,
};

function renderModal(overrides: Partial<Parameters<typeof RemapMarkerModal>[0]> = {}) {
  const onClose = vi.fn();
  const onSave = vi.fn();
  render(
    <RemapMarkerModal
      open
      onClose={onClose}
      override={null}
      computed={undefined}
      baseline={BASELINE}
      onSave={onSave}
      {...overrides}
    />
  );
  return { onClose, onSave };
}

describe('RemapMarkerModal', () => {
  it("seeds the fields from the character's baseline when the marker has neither an override nor a computed spread", () => {
    renderModal();
    expect(screen.getByLabelText('Intelligence')).toHaveValue(20);
    expect(screen.getByLabelText('Charisma')).toHaveValue(19);
    // The baseline sheet is already legal (sums to 99), so Save starts enabled.
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it("seeds the fields from the optimizer's computed spread when there is no manual override yet", () => {
    renderModal({ computed: COMPUTED });
    expect(screen.getByLabelText('Perception')).toHaveValue(24);
    expect(screen.getByLabelText('Intelligence')).toHaveValue(19);
  });

  it('prefers the manual override over a computed spread when both exist', () => {
    renderModal({ override: OVERRIDE, computed: COMPUTED });
    expect(screen.getByLabelText('Perception')).toHaveValue(27);
    expect(screen.getByLabelText('Willpower')).toHaveValue(21);
  });

  it('clamps an out-of-range value to 17..27 once the field loses focus', async () => {
    const user = userEvent.setup();
    renderModal();
    const field = screen.getByLabelText('Intelligence');
    await user.clear(field);
    await user.type(field, '99');
    await user.tab();
    expect(field).toHaveValue(27);
    await user.clear(field);
    await user.type(field, '1');
    await user.tab();
    expect(field).toHaveValue(17);
  });

  it('lets a full multi-digit value land while typing, without clamping mid-entry', async () => {
    // A value already reachable inside range (typing "25" over a field that
    // started at 20) must not get clamped to the 17 floor after the leading
    // "2" — that would make "25" unreachable by typing at all.
    const user = userEvent.setup();
    renderModal();
    const field = screen.getByLabelText('Intelligence');
    await user.clear(field);
    await user.type(field, '25');
    expect(field).toHaveValue(25);
  });

  it('disables Save while the total is off 99 and shows how far off, in warning not danger while still under budget', async () => {
    const user = userEvent.setup();
    renderModal();
    const intelligence = screen.getByLabelText('Intelligence');
    await user.clear(intelligence);
    await user.type(intelligence, '17');
    // Baseline int 20 -> 17 is -3 with nothing else changed: 3 points now
    // unallocated. Still mid-edit, not an error, so this is the warning tone.
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('3 points left to allocate');
    expect(status.className).toContain('text-warning');
    expect(status.className).not.toContain('text-danger');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('disables Save and shows danger once the total goes over budget', async () => {
    const user = userEvent.setup();
    renderModal();
    const intelligence = screen.getByLabelText('Intelligence');
    await user.clear(intelligence);
    await user.type(intelligence, '25');
    // Baseline int 20 -> 25 is +5, so the sheet now totals 104: 5 over budget.
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('5 points over budget');
    expect(status.className).toContain('text-danger');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('flags an out-of-range value even when the total already balances to 99', () => {
    // 30/17/17/18/17 sums to 99 but the first value is above the 27 ceiling —
    // "0 points left to allocate" would misleadingly read as done. Set with
    // fireEvent (one change event per field, not keystroke-by-keystroke) so
    // the exact target sheet lands regardless of controlled-input replay
    // quirks — already covered by the typing-specific tests above.
    renderModal();
    fireEvent.change(screen.getByLabelText('Intelligence'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Memory'), { target: { value: '17' } });
    fireEvent.change(screen.getByLabelText('Perception'), { target: { value: '17' } });
    fireEvent.change(screen.getByLabelText('Willpower'), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText('Charisma'), { target: { value: '17' } });

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('outside 17–27');
    expect(status.className).toContain('text-danger');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves the drafted attributes and closes', async () => {
    const user = userEvent.setup();
    const { onSave, onClose } = renderModal({ override: OVERRIDE });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(OVERRIDE);
    expect(onClose).toHaveBeenCalled();
  });

  it('offers "Clear override" only when the marker already has one, and it saves null', async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal({ override: OVERRIDE });
    await user.click(screen.getByRole('button', { name: 'Clear override' }));
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it('offers no "Clear override" for a marker with nothing to clear, even one with a computed spread', () => {
    renderModal({ override: null, computed: COMPUTED });
    expect(screen.queryByRole('button', { name: 'Clear override' })).toBeNull();
  });

  it('discards edits on Cancel without saving', async () => {
    const user = userEvent.setup();
    const { onSave, onClose } = renderModal();
    const intelligence = screen.getByLabelText('Intelligence');
    await user.clear(intelligence);
    await user.type(intelligence, '25');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('re-seeds the draft from fresh props each time the modal opens', () => {
    const { rerender } = render(
      <RemapMarkerModal
        open={false}
        onClose={vi.fn()}
        override={OVERRIDE}
        computed={undefined}
        baseline={BASELINE}
        onSave={vi.fn()}
      />
    );
    rerender(
      <RemapMarkerModal
        open
        onClose={vi.fn()}
        override={OVERRIDE}
        computed={undefined}
        baseline={BASELINE}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Perception')).toHaveValue(27);
  });
});
