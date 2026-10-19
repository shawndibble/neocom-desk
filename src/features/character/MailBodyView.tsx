import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { HintText } from '@/components/ui/HintText';
import { linkifyText } from '@/engine/mail/linkifyText';
import {
  markupColorToCss,
  markupPlainText,
  parseEveMarkup,
  sliceMarkupNodes,
  splitMarkupLines,
  type MarkupLinkTarget,
  type MarkupNode,
} from '@/engine/mail/eveMarkup';
import { splitMailLines, type MailLineBlock } from '@/engine/mail/mailBodyBlocks';
import {
  AllianceLink,
  CharacterLink,
  CorporationLink,
  ItemInfoLink,
  PlaceLink,
  SkillLink,
  SystemLink,
} from '@/features/entities/EntityLink';
import { cx } from '@/lib/cx';
import { resolveShowInfo, useItemKind } from './mailShowInfo';

/** The game's default mail text size; `size` nodes scale relative to it. */
export const BASE_SIZE_PX = 12;

/**
 * The reader's fixed surface for a mail body, theme-independent on purpose: a
 * sender picks colours against the game's dark mail window, and the game's own
 * default text is `#bfffffff` (white at 75%). Not a theme token — it must stay
 * dark in light theme too (docs/DESIGN.md §1, "EVE mail surface").
 */
export const EVE_MAIL_SURFACE_FRAME_CLASS =
  'rounded-xs border border-line bg-[#0a0e14] text-white/75';

/** The frame plus padding: a lone reading surface. */
export const EVE_MAIL_SURFACE_CLASS =
  'rounded-xs border border-line bg-[#0a0e14] p-3 text-white/75';

/** `https://x.example/a` or `www.x.example`, host only, for comparing link text with its href. */
function hostOfText(text: string): string | null {
  const value = text.trim();
  if (!/^(?:https?:\/\/|www\.)\S+$|^[\w-]+(?:\.[\w-]+)+(?:\/\S*)?$/i.test(value)) return null;
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function MarkupHttpLink({
  url,
  children,
  text,
}: {
  url: string;
  children: ReactNode;
  text: string;
}) {
  const { t } = useTranslation();
  const shown = hostOfText(text);
  const real = new URL(url).hostname.toLowerCase();
  // Link text that reads as one address but goes to another: say where it really goes.
  const title =
    shown !== null && shown !== real ? t('mail.markup.realHost', { host: real }) : undefined;
  return (
    <ExternalLink href={url} title={title}>
      {children}
    </ExternalLink>
  );
}

function ItemOrSkillLink({ typeId, children }: { typeId: number; children: ReactNode }) {
  const kind = useItemKind(typeId);
  return kind === 'skill' ? (
    <SkillLink typeId={typeId}>{children}</SkillLink>
  ) : (
    <ItemInfoLink typeId={typeId}>{children}</ItemInfoLink>
  );
}

function ShowInfoLink({ target, children }: { target: MarkupLinkTarget; children: ReactNode }) {
  const { t } = useTranslation();
  if (target.kind === 'showinfo') {
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
        return <ItemOrSkillLink typeId={info.typeId}>{children}</ItemOrSkillLink>;
      case 'place':
        return <PlaceLink id={info.id}>{children}</PlaceLink>;
      case 'noView':
        break;
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
            <MarkupHttpLink key={`${key}-${i}`} url={part.href} text={part.href}>
              {part.href}
            </MarkupHttpLink>
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
        const children = renderNodes(node.children, true);
        if (node.target.kind === 'http') {
          return (
            <MarkupHttpLink key={key} url={node.target.url} text={markupPlainText(node.children)}>
              {children}
            </MarkupHttpLink>
          );
        }
        return (
          <ShowInfoLink key={key} target={node.target}>
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
 * italic, underline, size, colour, links, in table cells too) on a fixed dark
 * surface, so a sender's text colour reads as intended in any theme; it is
 * parsed to a safe node tree, never injected as HTML.
 */
export function MailBodyView({ text, markup }: { text: string; markup?: string }) {
  const lines = useMemo((): MarkupNode[][] => {
    if (markup === undefined) {
      return text
        .split('\n')
        .map((l): MarkupNode[] => (l === '' ? [] : [{ type: 'text', text: l }]));
    }
    return splitMarkupLines(parseEveMarkup(markup));
  }, [text, markup]);
  const onSurface = markup !== undefined;
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
        onSurface ? EVE_MAIL_SURFACE_CLASS : 'text-text'
      )}
    >
      {blocks.map((block, index) => {
        if (block.kind === 'text') {
          return (
            <p key={index} className="whitespace-pre-wrap">
              {lines.slice(block.start, block.end).map((line, i) => (
                <span key={i}>
                  {i > 0 && '\n'}
                  {renderNodes(line, false)}
                </span>
              ))}
            </p>
          );
        }
        // A cell keeps its formatting: slice the row's line nodes at the cell's offsets.
        const cell = (row: number, col: number): ReactNode[] => {
          const span = block.spans[row][col];
          return renderNodes(
            sliceMarkupNodes(lines[block.rowLines[row]], span.start, span.end),
            false
          );
        };
        return (
          <div key={index} className="overflow-x-auto">
            <table className="border-collapse tabular-nums">
              <thead>
                <tr
                  className={cx(
                    'border-b',
                    onSurface ? 'border-white/20 opacity-70' : 'border-line text-text-dim'
                  )}
                >
                  {block.rows[0].map((_, c) => (
                    <th
                      key={c}
                      scope="col"
                      className={cx(
                        'py-0.5 pl-4 first:pl-0 font-normal whitespace-nowrap',
                        block.align[c] === 'right' ? 'text-right' : 'text-left'
                      )}
                    >
                      {cell(0, c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.slice(1).map((row, r) => (
                  <tr key={r}>
                    {row.map((_, c) => (
                      <td
                        key={c}
                        className={cx(
                          'py-0.5 pl-4 first:pl-0 whitespace-nowrap',
                          block.align[c] === 'right' && 'text-right'
                        )}
                      >
                        {cell(r + 1, c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
