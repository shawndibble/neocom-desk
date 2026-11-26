import { linkifyText } from '@/engine/mail/linkifyText';

export function contractDescriptionLinks(description: string | undefined): string[] {
  if (!description) return [];
  const hrefs = linkifyText(description).flatMap((part) =>
    part.kind === 'link' ? [part.href] : []
  );
  return [...new Set(hrefs)];
}
