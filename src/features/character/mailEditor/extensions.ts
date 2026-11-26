import { Mark, mergeAttributes, type Extensions } from '@tiptap/core';
import Bold from '@tiptap/extension-bold';
import Document from '@tiptap/extension-document';
import HardBreak from '@tiptap/extension-hard-break';
import Italic from '@tiptap/extension-italic';
import Link from '@tiptap/extension-link';
import Paragraph from '@tiptap/extension-paragraph';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import Text from '@tiptap/extension-text';
import Underline from '@tiptap/extension-underline';
import { Gapcursor, UndoRedo } from '@tiptap/extensions';
import {
  MARKUP_MAX_SIZE,
  MARKUP_MIN_SIZE,
  classifyMarkupLink,
  markupColorToCss,
} from '@/engine/mail/eveMarkup';
import { BASE_SIZE_PX } from '../MailBodyView';

const COLOR_ATTR = /^#[0-9a-f]{8}$/;

export const EveColor = Mark.create({
  name: 'eveColor',
  addAttributes() {
    return {
      color: {
        default: null as string | null,
        parseHTML: (el) => {
          const v = el.getAttribute('data-eve-color')?.toLowerCase() ?? null;
          return v !== null && COLOR_ATTR.test(v) ? v : null;
        },
        renderHTML: (attrs) =>
          typeof attrs.color === 'string' && COLOR_ATTR.test(attrs.color)
            ? { 'data-eve-color': attrs.color, style: `color: ${markupColorToCss(attrs.color)}` }
            : {},
      },
    };
  },
  parseHTML: () => [{ tag: 'span[data-eve-color]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes), 0],
});

export const EveSize = Mark.create({
  name: 'eveSize',
  addAttributes() {
    return {
      px: {
        default: null as number | null,
        parseHTML: (el) => {
          const n = Number(el.getAttribute('data-eve-size'));
          return Number.isInteger(n) && n >= MARKUP_MIN_SIZE && n <= MARKUP_MAX_SIZE ? n : null;
        },
        renderHTML: (attrs) =>
          typeof attrs.px === 'number'
            ? {
                'data-eve-size': String(attrs.px),
                style: `font-size: ${attrs.px / BASE_SIZE_PX}em`,
              }
            : {},
      },
    };
  },
  parseHTML: () => [{ tag: 'span[data-eve-size]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes), 0],
});

const PlainBold = Bold.extend({
  addInputRules: () => [],
  addPasteRules: () => [],
});
const PlainItalic = Italic.extend({
  addInputRules: () => [],
  addPasteRules: () => [],
});

const plainCell = { content: 'text*', marks: '' } as const;

export function mailEditorExtensions(): Extensions {
  return [
    Document,
    Paragraph,
    Text,
    HardBreak,
    PlainBold,
    PlainItalic,
    Underline,
    Link.configure({
      openOnClick: false,
      autolink: false,
      linkOnPaste: false,
      defaultProtocol: 'https',
      isAllowedUri: (url) => classifyMarkupLink(url) !== null,
      HTMLAttributes: { rel: null, target: null, class: 'underline' },
    }),
    EveColor,
    EveSize,
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader.extend(plainCell),
    TableCell.extend(plainCell),
    Gapcursor,
    UndoRedo,
  ];
}
