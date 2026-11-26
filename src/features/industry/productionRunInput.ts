export interface ProductionRunInput {
  quantity: number;
  materialCost: number;
  jobFee: number;
}

export interface ProductionRunInputErrors {
  quantity?: true;
  cost?: true;
}

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
