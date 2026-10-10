import type { TabItem } from './Tabs';

/**
 * A page with this many tabs or more shows a view picker instead of the strip
 * on a phone. The count is the page's *full* tab list, never what a pilot has
 * hidden, so a page cannot flip between strip and picker.
 */
export const VIEW_PICKER_MIN_TABS = 4;

/** Whether a page with `tabCount` tabs swaps its strip for the picker on a phone. */
export function usesViewPicker(tabCount: number, isPhone: boolean): boolean {
  return isPhone && tabCount >= VIEW_PICKER_MIN_TABS;
}

export interface PageViews {
  tabs: readonly TabItem[];
  /** Id of the current view. */
  value: string;
  onChange: (id: string) => void;
}
