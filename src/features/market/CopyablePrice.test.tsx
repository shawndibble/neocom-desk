import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { configureClipboard } from '@/lib/clipboard';
import { CopyablePrice } from './CopyablePrice';
import { priceClipboardText } from './priceClipboardText';

describe('priceClipboardText', () => {
  it('drops the decimal for a whole-ISK price', () => {
    expect(priceClipboardText(1_233_000)).toBe('1233000');
  });

  it('keeps two decimal places, no thousands separators, for a price with cents', () => {
    expect(priceClipboardText(12.34)).toBe('12.34');
    expect(priceClipboardText(449.9)).toBe('449.90');
  });

  it('pads a single cent digit', () => {
    expect(priceClipboardText(9.05)).toBe('9.05');
  });

  it('never groups thousands', () => {
    expect(priceClipboardText(1_235_000.5)).toBe('1235000.50');
  });
});

describe('CopyablePrice', () => {
  afterEach(() => configureClipboard(null));

  it('shows the formatted price on screen', () => {
    render(<CopyablePrice price={449.9} />);
    expect(screen.getByText('449.90')).toBeInTheDocument();
  });

  it('copies the plain-digit legal price when the price itself is clicked, and toasts', async () => {
    const written: string[] = [];
    configureClipboard(async (text) => {
      written.push(text);
    });
    render(<CopyablePrice price={1_233_000} />);

    await userEvent.setup().click(screen.getByText('1,233,000'));

    expect(written).toEqual(['1233000']);
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard');
  });

  it('has no separate copy icon button — the price text is the only control', async () => {
    render(<CopyablePrice price={12.34} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent('12.34');
    expect(buttons[0].querySelector('svg')).toBeNull();

    // The copy hint is a Tooltip, so keyboard focus reveals it too.
    await userEvent.setup().tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Copy 12.34');
  });

  it('renders caller-supplied text as the clickable content', async () => {
    const written: string[] = [];
    configureClipboard(async (text) => {
      written.push(text);
    });
    render(<CopyablePrice price={520.1}>Outbid at 520.10</CopyablePrice>);

    await userEvent.setup().click(screen.getByText('Outbid at 520.10'));

    expect(written).toEqual(['520.10']);
  });
});
