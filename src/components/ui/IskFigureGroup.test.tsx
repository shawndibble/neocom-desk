import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/i18n';
import { IskAmount } from './IskAmount';
import { IskFigureGroup } from './IskFigureGroup';

function setup() {
  return render(
    <IskFigureGroup>
      <IskAmount value={1_000_000} />
      <input aria-label="field" />
      <IskAmount value={2_000_000} />
      <IskAmount value={3_000_000} />
    </IskFigureGroup>
  );
}

const figures = () => Array.from(document.querySelectorAll<HTMLElement>('[data-isk-figure]'));
const press = (el: Element, key: string) => fireEvent.keyDown(el, { key });

describe('IskFigureGroup', () => {
  it('has one tab stop: the first figure, then the last one focused', () => {
    setup();
    expect(figures().map((f) => f.tabIndex)).toEqual([0, -1, -1]);
    act(() => figures()[2].focus());
    expect(figures().map((f) => f.tabIndex)).toEqual([-1, -1, 0]);
  });

  it('roves with arrows, Home and End; every figure keeps its exact text', () => {
    setup();
    act(() => figures()[0].focus());
    press(figures()[0], 'ArrowRight');
    expect(figures()[1]).toHaveFocus();
    press(figures()[1], 'End');
    expect(figures()[2]).toHaveFocus();
    expect(fireEvent.keyDown(figures()[2], { key: 'ArrowDown' })).toBe(true); // end: page scrolls
    expect(figures()[2]).toHaveFocus();
    press(figures()[2], 'Home');
    expect(figures()[0]).toHaveFocus();
    expect(screen.getByText('2,000,000.00', { exact: false, selector: '.sr-only' })).toBeTruthy();
  });

  it('keeps nested groups independent', () => {
    render(
      <IskFigureGroup>
        <IskAmount value={1_000_000} />
        <IskFigureGroup>
          <IskAmount value={2_000_000} />
          <IskAmount value={3_000_000} />
        </IskFigureGroup>
      </IskFigureGroup>
    );
    expect(figures().map((f) => f.tabIndex)).toEqual([0, 0, -1]);
  });

  it('leaves arrow keys alone inside other controls', () => {
    setup();
    const input = screen.getByRole('textbox');
    input.focus();
    const notPrevented = fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(notPrevented).toBe(true);
    expect(input).toHaveFocus();
  });
});
