export function appraisalMultibuyText(
  items: readonly { name: string; quantity: number; need?: number }[]
): string {
  return items
    .map((item) => ({ name: item.name, quantity: item.need ?? item.quantity }))
    .filter((item) => item.quantity > 0)
    .map((item) => `${item.name}\t${item.quantity}`)
    .join('\n');
}
