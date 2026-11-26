import type { ReactNode } from 'react';
import { Field } from '@/components/ui';

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return <Field label={label}>{children}</Field>;
}
