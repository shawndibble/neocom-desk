export function stripEveMarkup(description: string): string {
  return description
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

export function typeDescription(description: string | null | undefined): string | null {
  return description ? stripEveMarkup(description) : null;
}
