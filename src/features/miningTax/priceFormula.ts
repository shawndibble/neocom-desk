/**
 * The Overview table's "Price calculation" column: a row's raw sell value
 * written out as the math behind it — each ore's units times its unit price
 * on the chosen basis, then the buyback rate — so the pilot can check the
 * figure instead of taking it on trust. A row often mixes several ores, so
 * this states every line rather than one blended price.
 */
export interface FormulaLine {
  typeId: number;
  quantity: number;
  /** Full (pre-buyback-rate) raw value on the chosen basis. */
  rawValue: number;
}

export interface FormulaTerm {
  typeId: number;
  quantity: number;
  /** Full-price ISK per unit; null when the mined date had no price for this type. */
  unitPrice: number | null;
}

export interface RawValueFormula {
  terms: FormulaTerm[];
  ratePct: number;
  /** Matches the row's buyback-scaled raw sell value. */
  total: number;
}

export function rawValueFormula(lines: readonly FormulaLine[], ratePct: number): RawValueFormula {
  const byType = new Map<number, { quantity: number; rawValue: number }>();
  for (const line of lines) {
    const existing = byType.get(line.typeId) ?? { quantity: 0, rawValue: 0 };
    existing.quantity += line.quantity;
    existing.rawValue += line.rawValue;
    byType.set(line.typeId, existing);
  }
  const terms = [...byType].map(([typeId, { quantity, rawValue }]) => ({
    typeId,
    quantity,
    unitPrice: rawValue > 0 && quantity > 0 ? rawValue / quantity : null,
  }));
  const fullTotal = [...byType.values()].reduce((sum, type) => sum + type.rawValue, 0);
  return { terms, ratePct, total: (fullTotal * ratePct) / 100 };
}
