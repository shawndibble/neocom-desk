/** Joins present class fragments, so an absent optional never leaves a double or trailing space. */
export function cx(...parts: (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
