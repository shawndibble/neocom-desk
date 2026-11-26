export function cx(...parts: (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
