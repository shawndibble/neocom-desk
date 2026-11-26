export interface PayableRow {
  assignment: { characterId: number; taxOwed: number };
  characterName: string;
}

export interface PayerOption {
  characterId: number;
  characterName: string;
  subtotal: number;
}

export function payerOptions(rows: readonly PayableRow[]): PayerOption[] {
  const byCharacter = new Map<number, PayerOption>();
  for (const r of rows) {
    const id = r.assignment.characterId;
    const option = byCharacter.get(id) ?? {
      characterId: id,
      characterName: r.characterName,
      subtotal: 0,
    };
    option.subtotal += r.assignment.taxOwed;
    byCharacter.set(id, option);
  }
  return [...byCharacter.values()].sort(
    (a, b) => b.subtotal - a.subtotal || a.characterName.localeCompare(b.characterName)
  );
}

export function defaultPayer(
  rows: readonly PayableRow[],
  activeCharacterId: number | null
): number | null {
  const options = payerOptions(rows);
  if (options.length === 0) return null;
  return (
    options.find((o) => o.characterId === activeCharacterId)?.characterId ?? options[0].characterId
  );
}
