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
 * radios, tabs and textareas (sized by their content) are not; a bordered
 * `role="group"` (a `SegmentedControl`) counts as one control. What is
 * compared: within each flex row, the direct children that hold such controls
 * on one line, grouped by vertical overlap.
 * A child whose controls span several lines (a stacked form, a card) is a
 * layout of its own and is checked through its inner rows instead.
 *
 * Opt-out for a deliberate mismatch: `data-inline-height="exempt"` on the
 * control or any ancestor. Say why next to it.
 */
import type { Page } from '@playwright/test';
import { expect } from './testBase';

export interface ControlHeightMismatch {
  /** Short description of the row: its first controls' tag, label and height. */
  row: string;
  heights: number[];
}

/** Every flex row on the page (or inside `scope`) whose inline controls differ in height by more than 1px. */
export async function findControlHeightMismatches(
  page: Page,
  scope = 'main'
): Promise<ControlHeightMismatch[]> {
  return page.evaluate((scopeSelector) => {
    const CONTROL =
      'button, a[href], input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="range"]), select, [role="combobox"], [role="button"], [role="group"], [role="radiogroup"]';
    const root = document.querySelector(scopeSelector) ?? document.body;

    const isBoxed = (el: Element): boolean => {
      if (el.closest('[data-inline-height="exempt"], [role="tablist"], table thead')) return false;
      // Including a `role="combobox"` textarea: its height follows its lines.
      if (el.tagName === 'TEXTAREA') return false;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height < 20) return false;
      // A bordered group taller than one touch control is a panel, not a SegmentedControl.
      if (el.matches('[role="group"], [role="radiogroup"]') && rect.height > 48) return false;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
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

    const describe = (el: Element): string => {
      const label =
        el.getAttribute('aria-label') ??
        (el as HTMLInputElement).placeholder ??
        el.textContent?.trim().slice(0, 30) ??
        '';
      return `${el.tagName.toLowerCase()}"${label}"`;
    };

    const mismatches: { row: string; heights: number[] }[] = [];
    const seen = new Set<Element>();
    for (const control of outermost) {
      // Walk every flex-row ancestor: the mismatch may be between this
      // control's wrapper and a sibling several levels up.
      for (let el = control.parentElement; el && el !== root.parentElement; el = el.parentElement) {
        if (seen.has(el)) continue;
        const style = getComputedStyle(el);
        const isFlexRow =
          (style.display === 'flex' || style.display === 'inline-flex') &&
          style.flexDirection.startsWith('row');
        if (!isFlexRow) continue;
        seen.add(el);

        const items: { top: number; bottom: number; height: number; label: string }[] = [];
        for (const child of Array.from(el.children)) {
          const inChild = outermost.filter((c) => child === c || child.contains(c));
          if (inChild.length === 0) continue;
          const rects = inChild.map((c) => c.getBoundingClientRect());
          const tops = rects.map((r) => r.top);
          // Controls on several lines: a layout of its own, checked through its inner rows.
          if (Math.max(...tops) - Math.min(...tops) > rects[0].height) continue;
          const tallest = rects.reduce((a, b) => (b.height > a.height ? b : a));
          items.push({
            top: tallest.top,
            bottom: tallest.bottom,
            height: Math.round(tallest.height),
            label: describe(inChild[rects.indexOf(tallest)]),
          });
        }
        // Group by shared line: a wrapped row puts its second line in another group.
        const groups: (typeof items)[] = [];
        for (const item of items) {
          const mid = (item.top + item.bottom) / 2;
          const group = groups.find((g) => g.some((o) => mid > o.top && mid < o.bottom));
          if (group) group.push(item);
          else groups.push([item]);
        }
        for (const group of groups) {
          const heights = group.map((g) => g.height);
          if (group.length > 1 && Math.max(...heights) - Math.min(...heights) > 1) {
            mismatches.push({
              row: group.map((g) => `${g.label}@${g.height}`).join(' | '),
              heights,
            });
          }
        }
      }
    }
    return mismatches;
  }, scope);
}

/** Fails, listing every row, when any inline controls in `scope` differ in height. */
export async function expectInlineControlsAligned(
  page: Page,
  label: string,
  scope = 'main'
): Promise<void> {
  const mismatches = await findControlHeightMismatches(page, scope);
  expect(
    mismatches.map((m) => m.row),
    `${label}: inline controls of different heights (DESIGN.md §3 — one size per row)`
  ).toEqual([]);
}
