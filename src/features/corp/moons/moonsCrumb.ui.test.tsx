import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import '@/i18n';
import { Crumb } from './moonsParts';

function App({ initial }: { initial: string }) {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/refinery" element={<Link to="/detail">Open</Link>} />
        <Route path="/detail" element={<Crumb to="/list" label="Extractions" />} />
        <Route path="/list" element={<p>The list</p>} />
        <Route path="/" element={<p>Home</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Crumb', () => {
  it('goes back to the page it was opened from, labelled Back', async () => {
    render(<App initial="/refinery" />);
    await userEvent.click(screen.getByRole('link', { name: 'Open' }));
    await userEvent.click(screen.getByRole('link', { name: 'Back' }));
    expect(screen.getByRole('link', { name: 'Open' })).toBeTruthy();
    expect(screen.queryByText('The list')).toBeNull();
  });

  it('on a first load keeps its own destination and label', async () => {
    render(<App initial="/detail" />);
    await userEvent.click(screen.getByRole('link', { name: 'Extractions' }));
    expect(screen.getByText('The list')).toBeTruthy();
  });
});
