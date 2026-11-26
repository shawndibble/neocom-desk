export function computeOrderFillQuantity(
  initialVolumeRemain: number,
  currentVolumeRemain: number
): number {
  return Math.max(0, initialVolumeRemain - currentVolumeRemain);
}
