import { Fragment, type ReactNode } from 'react';

export function Sentence({
  text,
  slots,
}: {
  text: string;
  slots: Readonly<Record<string, ReactNode>>;
}) {
  const parts = text.split(/\{(\w+)\}/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 0 ? (
          part
        ) : (
          <Fragment key={i}>{part in slots ? slots[part] : `{${part}}`}</Fragment>
        )
      )}
    </>
  );
}
