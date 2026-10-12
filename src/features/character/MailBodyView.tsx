import { useMemo } from 'react';
import { splitMailBody } from '@/engine/mailBodyBlocks';
import { cx } from '@/lib/cx';

/**
 * A mail body. Prose keeps its whitespace; a table the sender lined up by hand
 * with runs of spaces (which only lines up in the client's own font) is drawn
 * as a real table. `text` is the stripped body, unchanged — Reply and Forward
 * quote that, not this rendering.
 */
export function MailBodyView({ text }: { text: string }) {
  const blocks = useMemo(() => splitMailBody(text), [text]);
  return (
    <div className="text-sm text-text break-words space-y-2">
      {blocks.map((block, index) =>
        block.kind === 'text' ? (
          <p key={index} className="whitespace-pre-wrap">
            {block.text}
          </p>
        ) : (
          <div key={index} className="overflow-x-auto">
            <table className="border-collapse tabular-nums">
              <thead>
                <tr className="border-b border-line text-text-dim">
                  {block.rows[0].map((cell, c) => (
                    <th
                      key={c}
                      scope="col"
                      className={cx(
                        'py-0.5 pl-4 first:pl-0 font-normal whitespace-nowrap',
                        block.align[c] === 'right' ? 'text-right' : 'text-left'
                      )}
                    >
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.slice(1).map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => (
                      <td
                        key={c}
                        className={cx(
                          'py-0.5 pl-4 first:pl-0 whitespace-nowrap',
                          block.align[c] === 'right' && 'text-right'
                        )}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
