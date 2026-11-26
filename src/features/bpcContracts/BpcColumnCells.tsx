import type { ReactNode } from 'react';

export function QualityValue({
  omitOnCard,
  children,
}: {
  omitOnCard: boolean;
  children: ReactNode;
}) {
  return (
    <span className="max-sm:text-text" data-dense-omit={omitOnCard ? '' : undefined}>
      {children}
    </span>
  );
}

export function DenseOmit({ children }: { children: ReactNode }) {
  return <span data-dense-omit>{children}</span>;
}
