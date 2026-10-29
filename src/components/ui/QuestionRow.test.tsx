import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuestionRow } from './QuestionRow';

describe('QuestionRow', () => {
  it('hides the answer while collapsed', () => {
    render(
      <ul>
        <QuestionRow question="Why?" expanded={false} onToggle={() => {}}>
          Because.
        </QuestionRow>
      </ul>
    );
    const toggle = screen.getByRole('button', { name: 'Why?' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).not.toHaveAttribute('aria-controls');
    expect(screen.queryByText('Because.')).toBeNull();
  });

  it('shows the answer, wired to the toggle, while expanded', () => {
    render(
      <ul>
        <QuestionRow
          id="why"
          question="Why?"
          expanded
          onToggle={() => {}}
          className="frame"
          answerClassName="text-text-dim"
        >
          Because.
        </QuestionRow>
      </ul>
    );
    const toggle = screen.getByRole('button', { name: 'Why?' });
    const answer = screen.getByText('Because.');
    expect(toggle).toHaveAttribute('aria-controls', answer.id);
    expect(answer.className).toContain('text-text-dim');
    expect(screen.getByRole('listitem')).toHaveAttribute('id', 'why');
    expect(screen.getByRole('listitem').className).toBe('frame');
  });

  it('calls onToggle on click', async () => {
    const onToggle = vi.fn();
    render(
      <ul>
        <QuestionRow question="Why?" expanded={false} onToggle={onToggle}>
          Because.
        </QuestionRow>
      </ul>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Why?' }));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
