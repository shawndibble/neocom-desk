export interface ProductionRunInput {
  quantity: number;
  materialCost: number;
  jobFee: number;
}

export interface ProductionRunInputErrors {
  quantity?: true;
  cost?: true;
}

/**
 * Refuses a Production Run that can't be a real build: no units, or no cost at
 * all. One of Material cost / Job fee at 0 is fine (owned materials, an offset);
 * only both at 0 is refused. Callers parse a blank field to 0 first.
 */
export function validateProductionRunInput({
  quantity,
  materialCost,
  jobFee,
}: ProductionRunInput): ProductionRunInputErrors {
  const errors: ProductionRunInputErrors = {};
  if (quantity <= 0) errors.quantity = true;
  if (materialCost <= 0 && jobFee <= 0) errors.cost = true;
  return errors;
}
