import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/i18n';
import { SurveyHowTo } from './SurveyHowTo';

describe('SurveyHowTo', () => {
  it('lists the six steps in one ordered list, with a picture for the in-game ones', () => {
    render(<SurveyHowTo />);
    expect(screen.getAllByRole('list')).toHaveLength(1);
    const steps = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(steps).toEqual([
      '1Right-click the Mining Surveyor icon.',
      '2Choose Open Scan Results Window.',
      '3Click Scan in the new window.',
      '4Expand every ore, so all its rocks are listed.',
      '5Click in the list, press Ctrl+A to select everything, then Ctrl+C to copy.',
      '6Come back here and press Ctrl+V.',
    ]);
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });
});
