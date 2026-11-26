export function priceClipboardText(price: number): string {
  const cents = Math.round(price * 100);
  const whole = Math.trunc(cents / 100);
  const remainder = Math.abs(cents % 100);
  return remainder === 0 ? String(whole) : `${whole}.${String(remainder).padStart(2, '0')}`;
}
