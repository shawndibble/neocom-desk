import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@/i18n';
import { ContractDescriptionLinks } from './ContractDescriptionLinks';
import { contractDescriptionLinks } from './contractDescriptionLinks';

describe('contractDescriptionLinks', () => {
  it('finds each http(s) link once, without trailing punctuation', () => {
    expect(
      contractDescriptionLinks(
        'Sheet: https://example.com/a. Again https://example.com/a and ftp://x.y'
      )
    ).toEqual(['https://example.com/a']);
  });

  it('is empty for plain text or no description', () => {
    expect(contractDescriptionLinks('just a note')).toEqual([]);
    expect(contractDescriptionLinks(undefined)).toEqual([]);
  });
});

describe('ContractDescriptionLinks', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders nothing without a link', () => {
    const { container } = render(<ContractDescriptionLinks description="no link here" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens the link in a new tab from a button naming the host', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<ContractDescriptionLinks description="see https://example.com/prices?x=1" />);
    fireEvent.click(screen.getByRole('button', { name: /Open example\.com/ }));
    expect(open).toHaveBeenCalledWith(
      'https://example.com/prices?x=1',
      '_blank',
      'noopener,noreferrer'
    );
  });
});
