import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SkillsIndexRedirect } from './SkillsIndexRedirect';

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/skills" element={<SkillsIndexRedirect />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('SkillsIndexRedirect', () => {
  it('sends /skills to Skill Plans', () => {
    renderAt('/skills');
    expect(screen.getByTestId('where')).toHaveTextContent('/skills/plans');
  });

  it('keeps ?character= so a push click still switches Character', () => {
    renderAt('/skills?character=90000012');
    expect(screen.getByTestId('where')).toHaveTextContent('/skills/plans?character=90000012');
  });
});
