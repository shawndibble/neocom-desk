/**
 * CCP-authored rich text — an item's description, a corporation's — rendered
 * from `parseItemDescription`'s runs as nested inline elements, never via
 * `dangerouslySetInnerHTML`. Line breaks survive through `whitespace-pre-line`.
 */
import { Fragment, type ReactNode } from 'react';
import { parseItemDescription, type DescriptionRun } from '@/engine/market/itemDescription';
import { cx } from '@/lib/cx';

export function EveMarkupText({ markup, className }: { markup: string; className?: string }) {
  return (
    <p className={cx('whitespace-pre-line', className)}>
      {parseItemDescription(markup).map((run, i) => (
        <DescriptionRunNode key={i} run={run} />
      ))}
    </p>
  );
}

function DescriptionRunNode({ run }: { run: DescriptionRun }) {
  let node: ReactNode = run.text;
  if (run.underline) node = <u>{node}</u>;
  if (run.italic) node = <i>{node}</i>;
  if (run.bold) node = <b>{node}</b>;
  return <Fragment>{node}</Fragment>;
}
