import { linkifyText } from '@/engine/mail/linkifyText';

/** The http(s) links in a contract's description, once each, in the order written. */
export function contractDescriptionLinks(description: string | undefined): string[] {
  if (!description) return [];
  const hrefs = linkifyText(description).flatMap((part) =>
    part.kind === 'link' ? [part.href] : []
  );
  return [...new Set(hrefs)];
}
