import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { IncompleteNotice } from './IncompleteNotice';

const TITLE = 'Incomplete data — some pages could not be loaded';

describe('IncompleteNotice', () => {
  it('says the data is incomplete, in amber micro-caps', () => {
    render(<IncompleteNotice className="px-3" />);
    const line = screen.getByText(TITLE);
    expect(line.tagName).toBe('P');
    expect(line).toHaveClass('text-warning', 'uppercase', 'px-3');
  });

  it('adds the hint after a dash', () => {
    const { container } = render(<IncompleteNotice hint="older history is missing" />);
    expect(container).toHaveTextContent(`${TITLE} — older history is missing`);
  });

  it('puts an action after the text in a wrapping row', () => {
    render(
      <IncompleteNotice hint="showing 10 items" action={<button type="button">Retry</button>} />
    );
    const line = screen.getByRole('button', { name: 'Retry' }).parentElement!;
    expect(line).toHaveClass('flex', 'flex-wrap');
    expect(line).toHaveTextContent(`${TITLE} — showing 10 itemsRetry`);
  });
});
