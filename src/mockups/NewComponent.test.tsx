import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NewComponent } from './NewComponent';

describe('NewComponent', () => {
  it('labels its content with the proposed component name', () => {
    render(
      <NewComponent name="BalanceTrend">
        <p>chart</p>
      </NewComponent>
    );
    expect(screen.getByText('New component: BalanceTrend')).toBeInTheDocument();
    expect(screen.getByText('chart')).toBeInTheDocument();
  });
});
