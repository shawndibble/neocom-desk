/**
 * Who pays a Settle up. ISK leaves one Character's wallet, so a Payee balance
 * that spans Characters is really one transfer per Character: Settle up asks
 * which one is paying and ticks that one's entries. Pure, so the default rule
 * is testable without the dialog.
 */

/** The slice of a Settle up row this needs. */
export interface PayableRow {
  assignment: { characterId: number; taxOwed: number };
  characterName: string;
}

export interface PayerOption {
  characterId: number;
  characterName: string;
  /** Sum of `taxOwed` over this Character's rows. */
  subtotal: number;
  count: number;
}

/** One option per Character among `rows`, most owed first (ties by name). */
export function payerOptions(rows: readonly PayableRow[]): PayerOption[] {
  const byCharacter = new Map<number, PayerOption>();
  for (const r of rows) {
    const id = r.assignment.characterId;
    const option = byCharacter.get(id) ?? {
      characterId: id,
      characterName: r.characterName,
      subtotal: 0,
      count: 0,
    };
    option.subtotal += r.assignment.taxOwed;
    option.count += 1;
    byCharacter.set(id, option);
  }
  return [...byCharacter.values()].sort(
    (a, b) => b.subtotal - a.subtotal || a.characterName.localeCompare(b.characterName)
  );
}

/**
 * The payer Settle up opens with, from a balance card or a selection: the one
 * Character when every entry is theirs; else the active Character when it has
 * some; else the Character owing most. `null` with no rows. (From a single row,
 * the caller already knows: that row's Character.)
 */
export function defaultPayer(
  rows: readonly PayableRow[],
  activeCharacterId: number | null
): number | null {
  const options = payerOptions(rows);
  if (options.length === 0) return null;
  if (options.some((o) => o.characterId === activeCharacterId) && options.length > 1) {
    return activeCharacterId;
  }
  return options[0].characterId;
}
