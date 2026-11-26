export interface Adjustment {
  id: string;
  minerId: string;
  date: string;
  amount: number;
  reason: string;
  by: number;
  at: string;
  reversed?: { by: number; at: string; reason: string };
  kind?: 'opening';
  replaces?: string;
}
