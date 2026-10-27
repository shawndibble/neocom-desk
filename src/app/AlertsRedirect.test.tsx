import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AlertsRedirect } from './AlertsRedirect';

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/alerts" element={<AlertsRedirect />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AlertsRedirect', () => {
  it('sends /alerts to the Overview with the panel open', () => {
    renderAt('/alerts');
    expect(screen.getByTestId('where')).toHaveTextContent('/overview?alerts=1');
  });

  it("keeps an alt's ?character= so a push click still switches Character", () => {
    renderAt('/alerts?character=90000002');
    expect(screen.getByTestId('where')).toHaveTextContent('/overview?character=90000002&alerts=1');
  });
});
