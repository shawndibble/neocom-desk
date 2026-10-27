import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/i18n';
import { MailCounter } from './MailCounter';

describe('MailCounter', () => {
  it.each([
    [8999, 'text-text-dim'],
    [9000, 'text-warning'],
    [10000, 'text-warning'],
    [10001, 'text-danger'],
  ])('at %i uses %s with warnFrom 0.9', (count, cls) => {
    render(<MailCounter count={count} max={10000} warnFrom={0.9} />);
    expect(screen.getByText(`${count} / 10000`)).toHaveClass(cls);
  });

  it('stays quiet near the limit without warnFrom', () => {
    render(<MailCounter count={9500} max={10000} />);
    expect(screen.getByText('9500 / 10000')).toHaveClass('text-text-dim');
  });
});
