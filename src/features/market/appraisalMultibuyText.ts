/**
 * The Appraisal's buy list as EVE's Multibuy text: one `name<TAB>quantity`
 * line per item. With "minus owned" on, rows carry `need` and the list uses
 * that net quantity, leaving fully covered lines out.
 */
export function appraisalMultibuyText(
  items: readonly { name: string; quantity: number; need?: number }[]
): string {
  return items
    .map((item) => ({ name: item.name, quantity: item.need ?? item.quantity }))
    .filter((item) => item.quantity > 0)
    .map((item) => `${item.name}\t${item.quantity}`)
    .join('\n');
}
