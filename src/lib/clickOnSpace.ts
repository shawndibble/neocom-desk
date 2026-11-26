import type { KeyboardEvent } from 'react';

export function clickOnSpace(e: KeyboardEvent<HTMLAnchorElement>): boolean {
  if (e.key !== ' ' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  e.preventDefault();
  if (!e.repeat) e.currentTarget.click();
  return true;
}
