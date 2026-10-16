import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { HintText } from '@/components/ui/HintText';
import { linkifyText } from '@/engine/linkifyText';
import {
  classifyMarkupLink,
  markupColorToCss,
  markupPlainText,
  parseEveMarkup,
  splitMarkupLines,
  type MarkupNode,
} from '@/engine/eveMarkup';
import { splitMailLines, type MailLineBlock } from '@/engine/mailBodyBlocks';
import {
  AllianceLink,
  CharacterLink,
  CorporationLink,
  ItemInfoLink,
  SystemLink,
} from '@/features/entities/EntityLink';
import { cx } from '@/lib/cx';
import { resolveShowInfo } from './mailShowInfo';

/** The game's default mail text size; `size` nodes scale relative to it. */
const BASE_SIZE_PX = 12;

function hasFormatting(nodes: readonly MarkupNode[]): boolean {
  return nodes.some((n) => n.type !== 'text' && n.type !== 'br');
}

function ShowInfoLink({ href, children }: { href: string; children: ReactNode }) {
  const { t } = useTranslation();
  const target = classifyMarkupLink(href);
  if (target?.kind === 'showinfo') {
    const info = resolveShowInfo(target.typeId, target.id);
    switch (info.kind) {
      case 'character':
        return <CharacterLink id={info.id}>{children}</CharacterLink>;
      case 'corporation':
        return <CorporationLink id={info.id}>{children}</CorporationLink>;
      case 'alliance':
        return <AllianceLink id={info.id}>{children}</AllianceLink>;
      case 'system':
        return <SystemLink systemId={info.id}>{children}</SystemLink>;
      case 'item':
        return <ItemInfoLink typeId={info.typeId}>{children}</ItemInfoLink>;
      case 'place':
        return <HintText content={t('mail.markup.placeSoon')}>{children}</HintText>;
    }
  }
  return <HintText content={t('mail.markup.openInEve')}>{children}</HintText>;
}

function renderNodes(nodes: readonly MarkupNode[], insideLink: boolean): ReactNode[] {
  return nodes.map((node, key): ReactNode => {
    switch (node.type) {
      case 'text':
        if (insideLink) return node.text;
        return linkifyText(node.text).map((part, i) =>
          part.kind === 'link' ? (
            <ExternalLink key={`${key}-${i}`} href={part.href}>
              {part.href}
            </ExternalLink>
          ) : (
            part.text
          )
        );
      case 'br':
        return '\n';
      case 'b':
        return <strong key={key}>{renderNodes(node.children, insideLink)}</strong>;
      case 'i':
        return <em key={key}>{renderNodes(node.children, insideLink)}</em>;
      case 'u':
        return <u key={key}>{renderNodes(node.children, insideLink)}</u>;
      case 'size':
        return (
          <span key={key} style={{ fontSize: `${node.px / BASE_SIZE_PX}em` }}>
            {renderNodes(node.children, insideLink)}
          </span>
        );
      case 'color':
        return (
          <span key={key} style={{ color: markupColorToCss(node.color) }}>
            {renderNodes(node.children, insideLink)}
          </span>
        );
      case 'link': {
        const target = classifyMarkupLink(node.href);
        const children = renderNodes(node.children, true);
        if (target?.kind === 'http') {
          return (
            <ExternalLink key={key} href={target.url}>
              {children}
            </ExternalLink>
          );
        }
        return (
          <ShowInfoLink key={key} href={node.href}>
            {children}
          </ShowInfoLink>
        );
      }
    }
  });
}

const isBlank = (line: readonly MarkupNode[]): boolean => markupPlainText(line).trim() === '';

/**
 * A mail body. Prose keeps its whitespace; a table the sender lined up with
 * runs of spaces (which only lines up in the client's own font) or wrote as
 * `| a | b |` rows is drawn as a real table. `text` is the stripped body,
 * unchanged — Reply and Forward quote that, not this rendering. `markup` is the
 * raw EVE markup: when given, the body renders as the game shows it (bold,
 * italic, underline, size, colour, links) on a dark surface so a sender's text
 * colour reads as intended in any theme; it is parsed to a safe node tree, never
 * injected as HTML.
 */
export function MailBodyView({ text, markup }: { text: string; markup?: string }) {
  const { lines, formatted } = useMemo(() => {
    if (markup === undefined) {
      return {
        lines: text
          .split('\n')
          .map((l): MarkupNode[] => (l === '' ? [] : [{ type: 'text', text: l }])),
        formatted: false,
      };
    }
    const nodes = parseEveMarkup(markup);
    return { lines: splitMarkupLines(nodes), formatted: hasFormatting(nodes) };
  }, [text, markup]);
  const blocks = useMemo(() => {
    const found = splitMailLines(lines.map((l) => markupPlainText(l)));
    const hasTable = found.some((b) => b.kind === 'table');
    return found.flatMap((b): MailLineBlock[] => {
      if (b.kind === 'table') return [b];
      let from = b.start;
      let to = b.end;
      if (hasTable) {
        // Around a table its own spacing supplies the gap.
        while (from < to && isBlank(lines[from])) from++;
        while (to > from && isBlank(lines[to - 1])) to--;
        if (from === to) return [];
      }
      return [{ ...b, start: from, end: to }];
    });
  }, [lines]);

  return (
    <div
      className={cx(
        'min-w-0 space-y-2 overflow-x-auto text-sm break-words',
        formatted ? 'rounded-xs border border-line bg-[#0a0e14] p-3 text-white/75' : 'text-text'
      )}
    >
      {blocks.map((block, index) =>
        block.kind === 'text' ? (
          <p key={index} className="whitespace-pre-wrap">
            {lines.slice(block.start, block.end).map((line, i) => (
              <span key={i}>
                {i > 0 && '\n'}
                {renderNodes(line, false)}
              </span>
            ))}
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
