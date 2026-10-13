/**
 * Inline controls in one row render at one height (DESIGN.md §3: "a toolbar
 * built from a single `size` value lines up by construction"). The rule kept
 * slipping anyway — a `Link` styled `buttonClassName({ size: 'sm' })` beside
 * a `SearchInput` (fixed `md`), a `FilterChip` (default `sm`) beside a
 * `NativeSelect` (default `md`) — because each control picks its own size and
 * nothing measured the row. jsdom has no layout, so this measures the real
 * boxes in the browser instead of reading props or classes, which also catches
 * hand-built controls.
 *
 * What counts: a visible, *boxed* control (a border or a fill — a ghost button
 * or a bare icon has no edge to misalign), at least 20px tall. Checkboxes,
 * radios, tabs, table headers and textareas (sized by their content) are not;
 * a bordered `role="group"` up to one touch control tall (a
 * `SegmentedControl`) counts as one control. What is compared: within each
 * flex row or grid, every control on one line, grouped by vertical overlap. A
 * child whose controls span several lines (a stacked form, a card) is a layout
 * of its own and is checked through its inner rows instead.
 *
 * Opt-out for a deliberate mismatch: `data-inline-height="exempt"` on the
 * control or any ancestor. Say why next to it.
 */
import type { Page } from '@playwright/test';
import { expect } from './testBase';

/** Desktop pointer tier, then the phone's touch tier, where half the mismatches only show. */
export const CONTROL_ROW_WIDTHS = [1280, 390] as const;

/** Each row, inside `scope`, whose inline controls differ in height by more than 1px. */
async function findControlHeightMismatches(page: Page, scope: string): Promise<string[]> {
  return page.evaluate((scopeSelector) => {
    const CONTROL =
      'button, a[href], input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="range"]), select, [role="combobox"], [role="button"], [role="group"], [role="radiogroup"]';
    const root = document.querySelector(scopeSelector);
    if (!root)
      throw new Error(`expectInlineControlsAligned: no element matches "${scopeSelector}"`);

    const isBoxed = (el: Element): boolean => {
      if (el.closest('[data-inline-height="exempt"], [role="tablist"], table thead')) return false;
      // Including a `role="combobox"` textarea: its height follows its lines.
      if (el.tagName === 'TEXTAREA') return false;
      // Opacity and visibility on any ancestor too: a hover-revealed row action is not there yet.
      if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height < 20) return false;
      // A bordered group taller than one touch control is a panel, not a SegmentedControl.
      if (el.matches('[role="group"], [role="radiogroup"]') && rect.height > 48) return false;
      const style = getComputedStyle(el);
      const bordered = parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== 'none';
      const filled =
        style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
      return bordered || filled;
    };

    const controls = Array.from(root.querySelectorAll(CONTROL)).filter(isBoxed);
    // A control nested in another counted control (an input's clear button) is the parent's part.
    const outermost = controls.filter(
      (el) => !controls.some((other) => other !== el && other.contains(el))
    );

    interface Box {
      top: number;
      bottom: number;
      height: number;
      label: string;
    }
    const boxOf = (el: Element): Box => {
      const rect = el.getBoundingClientRect();
      const label =
        el.getAttribute('aria-label') ||
        (el as HTMLInputElement).placeholder ||
        el.textContent?.trim().slice(0, 30) ||
        '';
      return {
        top: rect.top,
        bottom: rect.bottom,
        height: Math.round(rect.height),
        label: `${el.tagName.toLowerCase()}"${label}"`,
      };
    };
    /** Boxes sharing a line: each one's middle falls inside another's span. */
    const byLine = (boxes: Box[]): Box[][] => {
      const lines: Box[][] = [];
      for (const box of boxes) {
        const mid = (box.top + box.bottom) / 2;
        const line = lines.find((l) => l.some((o) => mid > o.top && mid < o.bottom));
        if (line) line.push(box);
        else lines.push([box]);
      }
      return lines;
    };

    const mismatches = new Set<string>();
    const checkedRows = new Set<Element>();
    for (const control of outermost) {
      // Walk every row ancestor: the mismatch may be between this control's
      // wrapper and a sibling several levels up.
      for (let el = control.parentElement; el && el !== root.parentElement; el = el.parentElement) {
        if (checkedRows.has(el)) continue;
        const style = getComputedStyle(el);
        const isRow =
          ((style.display === 'flex' || style.display === 'inline-flex') &&
            style.flexDirection.startsWith('row')) ||
          style.display === 'grid' ||
          style.display === 'inline-grid';
        if (!isRow) continue;
        checkedRows.add(el);

        const boxes: Box[] = [];
        for (const child of Array.from(el.children)) {
          const inChild = outermost.filter((c) => child === c || child.contains(c)).map(boxOf);
          // Controls on several lines: a layout of its own, checked through its inner rows.
          if (inChild.length > 0 && byLine(inChild).length === 1) boxes.push(...inChild);
        }
        for (const line of byLine(boxes)) {
          const heights = line.map((b) => b.height);
          if (line.length > 1 && Math.max(...heights) - Math.min(...heights) > 1) {
            mismatches.add(line.map((b) => `${b.label}@${b.height}`).join(' | '));
          }
        }
      }
    }
    return [...mismatches];
  }, scope);
}

/** Fails, listing every row, when any inline controls in `scope` differ in height. */
export async function expectInlineControlsAligned(
  page: Page,
  label: string,
  // `body` by default: header actions and portalled sheets sit outside `main`.
  scope = 'body'
): Promise<void> {
  expect(
    await findControlHeightMismatches(page, scope),
    `${label}: inline controls of different heights (DESIGN.md §3 — one size per row)`
  ).toEqual([]);
}
