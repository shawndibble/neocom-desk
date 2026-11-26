export function oreFormTypeId(
  rawTypeId: number,
  compressedByRaw: Readonly<Record<string, number>>,
  compressed: boolean
): number {
  return compressed ? (compressedByRaw[String(rawTypeId)] ?? rawTypeId) : rawTypeId;
}
