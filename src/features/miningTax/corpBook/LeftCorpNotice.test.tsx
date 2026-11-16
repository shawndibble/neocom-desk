import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { LeftCorpNotices } from './LeftCorpNotice';

const book = {
  corporationId: 20,
  corpName: 'Ashfall Mining Co.',
  owed: 1_250_000,
  characterIds: [1],
};

const setup = (over: Partial<Parameters<typeof LeftCorpNotices>[0]> = {}) => {
  const props = {
    books: [book],
    hidden: [],
    onPay: vi.fn(),
    onStopShowing: vi.fn(),
    onShow: vi.fn(),
    ...over,
  };
  render(<LeftCorpNotices {...props} />);
  return props;
};

describe('LeftCorpNotices', () => {
  it('says what the book still lists and pays through the corp pay flow', async () => {
    const props = setup();
    expect(screen.getByText('You left Ashfall Mining Co.')).toBeInTheDocument();
    expect(screen.getByText(/still lists 1,250,000 ISK/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pay 1,250,000 ISK' }));
    expect(props.onPay).toHaveBeenCalledWith(20);
  });

  it('stops showing the corporation', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Stop showing Ashfall Mining Co.' }));
    expect(props.onStopShowing).toHaveBeenCalledWith(20);
  });

  it('with nothing owed offers only Stop showing', () => {
    setup({ books: [{ ...book, owed: 0 }] });
    expect(screen.getByText(/lists nothing owed/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Pay/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Stop showing/ })).toBeInTheDocument();
  });

  it('lists hidden books with a way back, only while something is hidden', async () => {
    const props = setup({
      books: [],
      hidden: [{ corporationId: 20, corpName: 'Ashfall Mining Co.' }],
    });
    expect(screen.getByText(/Hidden: Ashfall Mining Co\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show Ashfall Mining Co. again' }));
    expect(props.onShow).toHaveBeenCalledWith(20);
  });

  it('renders nothing with nothing left or hidden', () => {
    const { container } = render(
      <LeftCorpNotices
        books={[]}
        hidden={[]}
        onPay={vi.fn()}
        onStopShowing={vi.fn()}
        onShow={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
