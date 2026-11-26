import { Fragment, useMemo, type ReactNode } from 'react';
import { StatChange } from '@/components/ui';
import type { FittingStatsDelta, StatChangeKey } from '@/engine/fittings/variationDelta';
import { StatPreviewContext, useChangedKeys, type Changes } from './statPreviewContext';

export function StatPreviewProvider({
  delta,
  children,
}: {
  delta: FittingStatsDelta | null | undefined;
  children: ReactNode;
}) {
  const changes = useMemo<Changes | null>(
    () =>
      delta && delta.count > 0
        ? new Map(delta.changes.map((change) => [change.key, change]))
        : null,
    [delta]
  );
  return <StatPreviewContext.Provider value={changes}>{children}</StatPreviewContext.Provider>;
}

export function PreviewedFigure({
  keys,
  children,
}: {
  keys?: readonly StatChangeKey[];
  children: ReactNode;
}) {
  const changed = useChangedKeys(keys);
  if (changed.length === 0) return <>{children}</>;
  return (
    <>
      {changed.map((change, index) => (
        <Fragment key={change.key}>
          {index > 0 && ' · '}
          <StatChange change={change} bare />
        </Fragment>
      ))}
    </>
  );
}
