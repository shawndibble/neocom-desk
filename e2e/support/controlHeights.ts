import type { Page } from '@playwright/test';
import { expect } from './testBase';

export const CONTROL_ROW_WIDTHS = [1280, 390] as const;

export async function findControlHeightMismatches(page: Page, scope: string): Promise<string[]> {
  return page.evaluate((scopeSelector) => {
    const CONTROL =
      'button, a[href], input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="range"]), select, [role="combobox"], [role="button"], [role="group"], [role="radiogroup"]';
    const root = document.querySelector(scopeSelector);
    if (!root)
      throw new Error(`expectInlineControlsAligned: no element matches "${scopeSelector}"`);

    const isBoxed = (el: Element): boolean => {
      if (el.closest('[data-inline-height="exempt"], [role="tablist"], table thead')) return false;
      if (el.tagName === 'TEXTAREA') return false;
      if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height < 20) return false;
      if (el.matches('[role="group"], [role="radiogroup"]') && rect.height > 48) return false;
      const style = getComputedStyle(el);
      const bordered = parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== 'none';
      const filled =
        style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
      return bordered || filled;
    };

    const controls = Array.from(root.querySelectorAll(CONTROL)).filter(isBoxed);
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

export async function expectInlineControlsAligned(
  page: Page,
  label: string,
  scope = 'body'
): Promise<void> {
  expect(
    await findControlHeightMismatches(page, scope),
    `${label}: inline controls of different heights (DESIGN.md §3 — one size per row)`
  ).toEqual([]);
}
