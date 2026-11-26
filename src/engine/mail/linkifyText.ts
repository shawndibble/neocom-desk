export type LinkifiedPart = { kind: 'text'; text: string } | { kind: 'link'; href: string };

const URL_PATTERN = /https?:\/\/[^\s<>"]+/gi;
const TRAILING = /[.,;:!?)\]}'"]+$/;

export function linkifyText(text: string): LinkifiedPart[] {
  const parts: LinkifiedPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const href = match[0].replace(TRAILING, '');
    if (!/^https?:\/\/[^/?#\s]+/i.test(href)) continue;
    const start = match.index;
    if (start > last) parts.push({ kind: 'text', text: text.slice(last, start) });
    parts.push({ kind: 'link', href });
    last = start + href.length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts.length > 0 ? parts : [{ kind: 'text', text }];
}
