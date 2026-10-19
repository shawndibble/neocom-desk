import type { ReactNode } from 'react';

/**
 * ME, TE or runs: full text on the phone card's dim meta line, since the
 * copy's quality is what a buyer reads after its price — or left off that
 * line entirely when one blueprint is picked and the card's title already
 * says it.
 */
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

/** A "—" the dense phone card drops from its meta line rather than printing as one more `·` field. */
export function DenseOmit({ children }: { children: ReactNode }) {
  return <span data-dense-omit>{children}</span>;
}
