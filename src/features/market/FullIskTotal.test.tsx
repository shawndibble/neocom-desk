import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { configureClipboard } from '@/lib/clipboard';
import { FullIskTotal } from './FullIskTotal';

describe('FullIskTotal compact', () => {
  afterEach(() => configureClipboard(null));

  it('names the button with its visible text plus the exact figure (WCAG 2.5.3)', () => {
    render(<FullIskTotal value={67_214_000_000} compact />);
    const button = screen.getByRole('button', { name: /^Copy 67\.2B ISK/ });
    expect(button).toHaveTextContent('67.2B');
    expect(button).toHaveAccessibleName('Copy 67.2B ISK (67,214,000,000)');
  });

  it('shows the exact figure in the hover tooltip', async () => {
    render(<FullIskTotal value={67_214_000_000} compact />);
    await userEvent.hover(screen.getByRole('button'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('67,214,000,000 ISK');
  });

  it('copies the full digits and confirms with the exact figure, readable on a tap', async () => {
    const written: string[] = [];
    configureClipboard(async (text) => {
      written.push(text);
    });
    render(<FullIskTotal value={67_214_000_000} compact />);
    await userEvent.click(screen.getByRole('button'));
    expect(written).toEqual(['67,214,000,000']);
    expect(await screen.findByRole('status')).toHaveTextContent('Copied 67,214,000,000 ISK');
  });
});
