import type { ReactNode } from 'react';
import { Field } from '@/components/ui';

/**
 * One labelled row of the Survey's Additional information panel: the label in
 * the left column, its value or control in the right, as in `Fields variant="form"`.
 * The editable panel, the read-only one and the start page's form all share this look.
 */
export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return <Field label={label}>{children}</Field>;
}
