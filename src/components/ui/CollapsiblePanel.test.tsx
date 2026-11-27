import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CollapsiblePanel } from './CollapsiblePanel';

function panel(onToggle: () => void, expanded = false) {
  return render(
    <CollapsiblePanel
      title="Costs"
      meta="3 lines"
      expanded={expanded}
      onToggle={onToggle}
      labels={{ show: 'Show costs', hide: 'Hide costs' }}
      actions={<button type="button">Templates</button>}
    >
      <p>detail</p>
    </CollapsiblePanel>
  );
}

describe('CollapsiblePanel', () => {
  it('toggles from a press anywhere on the header, title and meta included', () => {
    const onToggle = vi.fn();
    panel(onToggle);
    fireEvent.click(screen.getByText('Costs'));
    fireEvent.click(screen.getByText('3 lines'));
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('toggles once from the caret, which leads the title rather than trailing the actions', () => {
    const onToggle = vi.fn();
    panel(onToggle);
    const caret = screen.getByRole('button', { name: 'Show costs' });
    fireEvent.click(caret);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(caret.compareDocumentPosition(screen.getByText('Costs'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(caret.compareDocumentPosition(screen.getByText('Templates'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it("leaves a header action's own press alone", () => {
    const onToggle = vi.fn();
    panel(onToggle);
    fireEvent.click(screen.getByText('Templates'));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('leaves no empty padded body under the header while folded', () => {
    const { container } = panel(() => {});
    expect(screen.queryByText('detail')).toBeNull();
    expect(container.querySelector('section')?.children).toHaveLength(1);
  });

  it('fades the body in when opened, but not when it mounts open', () => {
    const { rerender } = panel(() => {}, true);
    expect(screen.getByText('detail').parentElement).not.toHaveClass('motion-fade');
    rerender(
      <CollapsiblePanel title="Costs" expanded={false} onToggle={() => {}}>
        <p>detail</p>
      </CollapsiblePanel>
    );
    rerender(
      <CollapsiblePanel title="Costs" expanded onToggle={() => {}}>
        <p>detail</p>
      </CollapsiblePanel>
    );
    expect(screen.getByText('detail').parentElement).toHaveClass('motion-fade');
  });

  it('shows the body and the hide label while open', () => {
    panel(() => {}, true);
    expect(screen.getByText('detail')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hide costs' }).getAttribute('aria-expanded')).toBe(
      'true'
    );
  });
});
