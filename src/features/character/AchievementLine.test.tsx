import { describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import '@/i18n';
import { AchievementCell, AchievementLine } from './AchievementLine';
import { useAchievementParts } from './useCharacterAchievements';

const TITLE_ID = '0c231769-621e-53d5-bd49-ce07a7b4a544';
const loadCharacterTitles = vi.fn(async () => ({ [TITLE_ID]: 'Selenologist' }));
vi.mock('@/sde/loadSde', () => ({ loadCharacterTitles: () => loadCharacterTitles() }));

describe('AchievementLine', () => {
  it('reads "Title · N points"', () => {
    const { container } = render(
      <AchievementLine parts={{ title: 'Selenologist', score: 1240 }} />
    );
    expect(container).toHaveTextContent('Selenologist · 1,240 points');
  });

  it('shows the score alone without a title, singular for one', () => {
    render(<AchievementLine parts={{ title: null, score: 1 }} />);
    expect(screen.getByText('1 point')).toBeInTheDocument();
  });

  it('renders nothing with nothing to show, or before the record loads', () => {
    const { container, rerender } = render(<AchievementLine parts={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<AchievementLine parts={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('useAchievementParts', () => {
  it('names the title once the baked table loads', async () => {
    const { result } = renderHook(() => useAchievementParts({ score: 1240, titleId: TITLE_ID }));
    await waitFor(() => expect(result.current).toEqual({ title: 'Selenologist', score: 1240 }));
  });

  it('never loads the table for a Character with no title', () => {
    loadCharacterTitles.mockClear();
    const { result } = renderHook(() => useAchievementParts({ score: 85, titleId: null }));
    expect(result.current).toEqual({ title: null, score: 85 });
    expect(loadCharacterTitles).not.toHaveBeenCalled();
  });
});

describe('AchievementCell', () => {
  it('puts the title over the points', () => {
    render(<AchievementCell parts={{ title: 'Selenologist', score: 385 }} stacks={false} />);
    expect(screen.getByText('Selenologist')).toBeInTheDocument();
    expect(screen.getByText('385 points')).toBeInTheDocument();
  });

  it('is a dash with nothing to show', () => {
    render(<AchievementCell parts={null} stacks={false} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
