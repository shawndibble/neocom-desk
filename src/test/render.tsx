import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, type RenderResult } from '@testing-library/react';

export function renderInRouter(ui: ReactElement): RenderResult {
  return render(ui, { wrapper: MemoryRouter });
}
