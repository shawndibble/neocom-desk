export const PRIMARY_SEARCH_ATTRIBUTE = 'data-primary-search';

function isShown(element: HTMLInputElement): boolean {
  if (element.disabled || element.closest('[inert], [hidden]')) return false;
  return typeof element.checkVisibility === 'function' ? element.checkVisibility() : true;
}

export function focusPageSearch(root: ParentNode = document): boolean {
  const main = root.querySelector('main');
  if (!main) return false;
  const candidates = [
    ...main.querySelectorAll<HTMLInputElement>(`input[${PRIMARY_SEARCH_ATTRIBUTE}]`),
    ...main.querySelectorAll<HTMLInputElement>('input[type="search"]'),
  ];
  const target = candidates.find(isShown);
  if (!target) return false;
  target.focus();
  target.select();
  return true;
}
