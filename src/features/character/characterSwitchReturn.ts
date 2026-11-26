import { VIEWED_CHARACTER_PARAM } from './viewedCharacter';

const ASSETS_ITEMS = '/assets/items';
const CHARACTER_ID_PARAMS = [VIEWED_CHARACTER_PARAM, 'chars'];

export function returnPathAfterSwitch(from: string | undefined): string | null {
  if (!from) return null;
  const url = new URL(from, 'http://origin.invalid');
  if (url.pathname === '/characters') return null;
  const pathname = url.pathname.startsWith(`${ASSETS_ITEMS}/`) ? ASSETS_ITEMS : url.pathname;
  for (const key of CHARACTER_ID_PARAMS) {
    if (/^\d+$/.test(url.searchParams.get(key) ?? '')) url.searchParams.delete(key);
  }
  return `${pathname}${url.search}${url.hash}`;
}
