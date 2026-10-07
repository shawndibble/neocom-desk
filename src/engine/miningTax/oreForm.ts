/**
 * Ore Form (CONTEXT.md): the type a mined ore is valued and named as. The
 * mining ledger only ever reports the raw type; with Compressed on, an ore
 * that has a plain "Compressed" counterpart reads as it, and one that has
 * none stays raw.
 */
export function oreFormTypeId(
  rawTypeId: number,
  compressedByRaw: Readonly<Record<string, number>>,
  compressed: boolean
): number {
  return compressed ? (compressedByRaw[String(rawTypeId)] ?? rawTypeId) : rawTypeId;
}
