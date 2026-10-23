import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { AchievementCell, AchievementLine } from './AchievementLine';

const TITLE_ID = '0c231769-621e-53d5-bd49-ce07a7b4a544';
const loadCharacterTitles = vi.fn(async () => ({ [TITLE_ID]: 'Selenologist' }));
vi.mock('@/sde/loadSde', () => ({ loadCharacterTitles: () => loadCharacterTitles() }));

describe('AchievementLine', () => {
  it('reads "Title · N points" once the title table loads', async () => {
    render(<AchievementLine achievement={{ score: 1240, titleId: TITLE_ID }} />);
    expect(await screen.findByTitle('Selenologist · 1,240 points')).toHaveTextContent(
      'Selenologist · 1,240 points'
    );
  });

  it('shows the score alone without a title, and never loads the title table', () => {
    loadCharacterTitles.mockClear();
    render(<AchievementLine achievement={{ score: 1, titleId: null }} />);
    expect(screen.getByText('1 point')).toBeInTheDocument();
    expect(loadCharacterTitles).not.toHaveBeenCalled();
  });

  it('renders nothing for a score of 0 and no title, or before the record loads', () => {
    const { container, rerender } = render(
      <AchievementLine achievement={{ score: 0, titleId: null }} />
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<AchievementLine achievement={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('AchievementCell', () => {
  it('puts the title over the points', () => {
    render(
      <AchievementCell
        achievement={{ score: 385, titleId: TITLE_ID }}
        titleNames={{ [TITLE_ID]: 'Selenologist' }}
      />
    );
    expect(screen.getByText('Selenologist')).toBeInTheDocument();
    expect(screen.getByText('385 points')).toBeInTheDocument();
  });

  it('is a dash with nothing to show', () => {
    render(<AchievementCell achievement={{ score: 0, titleId: null }} titleNames={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
