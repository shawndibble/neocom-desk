/**
 * The Status column's width for the labels on screen, as one of four literal
 * Tailwind classes (a class built at run time would never be generated). A
 * pill prints its label in small caps, about half a rem a character, inside
 * the cell's own padding; the floor is the header, "Status" and its sort
 * arrow. Open and History share their columns so they line up, so the caller
 * passes the labels of both tables.
 */
export function statusColumnWidthClass(
  labels: readonly string[],
  { markedLabels = [] }: { markedLabels?: readonly string[] } = {}
): string {
  const marked = new Set(markedLabels);
  // The overlap mark beside a corp pill takes about two characters of room.
  const longest = Math.max(0, ...labels.map((l) => l.length + (marked.has(l) ? 2 : 0)));
  if (longest <= 6) return 'sm:w-24';
  if (longest <= 9) return 'sm:w-28';
  if (longest <= 11) return 'sm:w-32';
  return 'sm:w-36';
}
