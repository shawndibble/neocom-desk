import { Fragment, type ReactNode } from 'react';

/**
 * A translated sentence with components in it (an entity link, a bold planet
 * name). The translation carries `{slot}` tokens, filled here: a caller passes
 * `t(key, { item: '{item}', count })` so i18next resolves plurals and the rest
 * of the sentence, and the tokens come back literal for this to swap in.
 */
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
