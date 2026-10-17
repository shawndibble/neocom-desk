import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
vi.mock('@/sde/loadSde', () => ({
  loadTypes: async () => ({ '3300': { groupID: 255 }, '587': { groupID: 25 } }),
  loadGroupCategories: async () => ({ '255': 16, '25': 6 }),
}));
import { MailBodyView } from './MailBodyView';

function renderMarkup(markup: string) {
  return render(
    <MemoryRouter>
      <MailBodyView text="" markup={markup} />
    </MemoryRouter>
  );
}

describe('MailBodyView', () => {
  it('renders a hand-spaced table as table cells', () => {
    render(<MailBodyView text={'Hi\n\nName     m3      ISK\nOlorf    1,115    9,206\n\nBye'} />);
    expect(screen.getByRole('cell', { name: 'Olorf' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '9,206' })).toHaveClass('text-right');
    expect(screen.getByText('Bye')).toBeInTheDocument();
  });

  it('leaves plain prose as text', () => {
    render(<MailBodyView text="Just a note." />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Just a note.')).toBeInTheDocument();
  });

  it('pads a column the same in every row, whether or not the row is the longest', () => {
    render(<MailBodyView text={'A    B    C    D\nx    1    2    3\ny    4    5'} />);
    // Padding that depends on being the row's last cell shifts a short row's
    // numbers out from under the longer row's in the same column.
    expect(screen.getByRole('cell', { name: '2' }).className).toBe(
      screen.getByRole('cell', { name: '5' }).className
    );
  });

  it('turns an http link in prose into a new-tab link', () => {
    render(<MailBodyView text={'Open this:\nhttps://a.example/join/X1'} />);
    const link = screen.getByRole('link', { name: /https:\/\/a\.example\/join\/X1/ });
    expect(link).toHaveAttribute('href', 'https://a.example/join/X1');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders bold, italic, underline, size and colour from markup', () => {
    renderMarkup(
      '<b>bold</b> <i>ital</i> <u>und</u> <font size="24" color="#ffff0000">big red</font>'
    );
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('ital').tagName).toBe('EM');
    expect(screen.getByText('und').tagName).toBe('U');
    const big = screen.getByText('big red');
    expect(big).toHaveStyle({ color: 'rgb(255, 0, 0)' });
    expect(big.parentElement?.getAttribute('style')).toContain('font-size: 2em');
  });

  it('never renders script or style from a hostile body', () => {
    const { container } = renderMarkup(
      '<script>x</script><b onclick="x()" style="color:red">hi</b><a href="javascript:alert(1)">no</a>'
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('[onclick],[style]')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
  });

  it('opens a character show-info link in the app', () => {
    renderMarkup('<a href="showinfo:1377//90000001">Pilot</a>');
    expect(screen.getByRole('link', { name: 'Pilot' })).toHaveAttribute(
      'href',
      '/?info=character-90000001'
    );
  });

  it('sends a system show-info link to Route Safety', () => {
    renderMarkup('<a href="showinfo:5//30000142">Jita</a>');
    expect(screen.getByRole('link', { name: 'Jita' }).getAttribute('href')).toMatch(/30000142/);
  });

  it('opens an item show-info link as an item', () => {
    renderMarkup('<a href="showinfo:587">Rifter</a>');
    expect(screen.getByRole('link', { name: 'Rifter' })).toHaveAttribute('href', '/?info=type-587');
  });

  it('opens region, station and structure links in Place Info', () => {
    renderMarkup(
      '<a href="showinfo:3//10000002">The Forge</a> <a href="showinfo:1529//60003760">Station</a> <a href="showinfo:35832//1030000000000">Fort</a>'
    );
    expect(screen.getByRole('link', { name: 'The Forge' })).toHaveAttribute(
      'href',
      '/?info=place-10000002'
    );
    expect(screen.getByRole('link', { name: 'Station' })).toHaveAttribute(
      'href',
      '/?info=place-60003760'
    );
    expect(screen.getByRole('link', { name: 'Fort' })).toHaveAttribute(
      'href',
      '/?info=place-1030000000000'
    );
  });

  it('renders constellation and fitting links as non-clickable text', () => {
    renderMarkup('<a href="showinfo:4//20000020">Kimotoro</a> <a href="fitting:588:1">Fit</a>');
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Kimotoro')).toBeInTheDocument();
    expect(screen.getByText('Fit')).toBeInTheDocument();
  });

  it('keeps http links and bare-URL linkify working in markup', () => {
    renderMarkup('<a href="https://a.example/x">go</a> and https://b.example/y');
    expect(screen.getByRole('link', { name: /go/ })).toHaveAttribute('href', 'https://a.example/x');
    expect(screen.getByRole('link', { name: /b\.example/ })).toBeInTheDocument();
  });

  it('draws a pipe table from markup', () => {
    renderMarkup('Hi<br>| Name | ISK |<br>|---|---|<br>| Olorf | 90 |');
    expect(screen.getByRole('cell', { name: 'Olorf' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
  });

  it('draws the dark surface for every mail on the markup path, formatted or not', () => {
    const { container } = renderMarkup('Just words');
    expect(container.firstElementChild?.className).toContain('bg-[#0a0e14]');
  });

  it('keeps bold, colour and links inside table cells', () => {
    renderMarkup('| Name | ISK |\n| <b>Olorf</b> | <font color="#ff00ff00">90</font> |');
    expect(screen.getByText('Olorf').tagName).toBe('STRONG');
    expect(screen.getByText('90')).toHaveStyle({ color: 'rgb(0, 255, 0)' });
  });

  it('shows the real host when link text names a different one', () => {
    renderMarkup('<a href="https://evil.example/x">https://zkillboard.com/kill/1</a>');
    expect(screen.getByRole('link', { name: /zkillboard/ })).toHaveAttribute(
      'title',
      'Opens evil.example'
    );
  });

  it('adds no title when the text matches the host or is a plain label', () => {
    renderMarkup(
      '<a href="https://a.example/x">a.example</a> <a href="https://a.example/y">go</a>'
    );
    for (const link of screen.getAllByRole('link')) expect(link).not.toHaveAttribute('title');
  });

  it('never nests anchors', () => {
    const { container } = renderMarkup(
      '<a href="https://a.example">x <a href="https://b.example">y</a></a>'
    );
    expect(container.querySelector('a a')).toBeNull();
  });

  it('opens a skill show-info link in the skill modal', async () => {
    renderMarkup('<a href="showinfo:3300">Gunnery</a>');
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Gunnery' })).toHaveAttribute(
        'href',
        '/?info=skill-3300'
      )
    );
  });

  it('opens a ship show-info link as an item, there being no ship window by typeID', async () => {
    renderMarkup('<a href="showinfo:587">Rifter</a>');
    await waitFor(() => expect(screen.getByRole('link', { name: 'Rifter' })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Rifter' })).toHaveAttribute('href', '/?info=type-587');
  });
});
