/**
 * The rich mail body editor: Tiptap (ProseMirror) over a schema that can only
 * say what EVE markup can, and one card: format bar on top (with the Source
 * toggle), the writing surface, the character counter in the corner.
 * Loaded lazily (`MailBodyEditor.tsx`) so the Mail page pays nothing for it
 * until a composer opens. docs/adr/0022-tiptap-for-the-mail-body-editor.md.
 *
 * `value` and `onChange` are EVE markup. Every value this component emits has
 * gone through `sanitizeMarkup`/`docToMarkup`, i.e. `eveMarkup.ts`, so the
 * composer, the draft and the wire only ever see the safe subset. Mobile soft
 * keyboards and IME composition are ProseMirror's own; nothing here touches
 * composition events.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { useTranslation } from 'react-i18next';
import { TextArea } from '@/components/ui';
import { cx } from '@/lib/cx';
import { useIsDesktop } from '@/lib/useIsDesktop';
import {
  droppedMarkup,
  docToMarkup,
  markupToDoc,
  sanitizeMarkup,
  type EditorDoc,
} from '@/engine/mail/mailEditorDoc';
import {
  buildPipeTableLines,
  emptyFormatState,
  parsePastedPipeTable,
  planSourceLink,
  sourceLinkAt,
  sourceTagPair,
  wrapSourceSelection,
  type SourceTag,
} from '@/engine/mail/mailFormat';
import { EVE_MAIL_SURFACE_FRAME_CLASS } from '../MailBodyView';
import type { MailBodyEditorProps } from '../MailBodyEditor';
import type { MailEditorCommands, ToggleMark } from './commands';
import { mailEditorExtensions } from './extensions';
import { formatStateOfEditor, linkCarryMarks, linkTargetOfEditor } from './editorState';
import { MailFormatBar } from './MailFormatBar';

type Mode = 'preview' | 'source';

const SOURCE_TAG: Record<ToggleMark, SourceTag> = {
  bold: { kind: 'bold' },
  italic: { kind: 'italic' },
  underline: { kind: 'underline' },
};

export default function RichMailBodyEditor({
  value,
  onChange,
  id,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  disabled,
  className,
  counter,
}: MailBodyEditorProps) {
  const { t } = useTranslation();
  const phone = !useIsDesktop();
  const [mode, setMode] = useState<Mode>('preview');
  const [source, setSource] = useState(value);
  const [dropped, setDropped] = useState(false);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<[number, number] | null>(null);
  // What this editor last handed up; a different `value` came from outside (a draft loaded).
  const lastEmitted = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const editorRef = useRef<Editor | null>(null);
  const extensions = useMemo(() => mailEditorExtensions(), []);

  const editor = useEditor({
    extensions,
    content: markupToDoc(value),
    editable: !disabled,
    onUpdate: ({ editor: ed }) => {
      const markup = docToMarkup(ed.getJSON() as EditorDoc);
      lastEmitted.current = markup;
      onChangeRef.current(markup);
    },
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': t('mail.bodyLabel'),
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(invalid ? { 'aria-invalid': 'true' } : {}),
        class: 'flex-1 outline-none',
      },
      // Pasted HTML is parsed through the schema above (only the safe subset
      // exists in it). A markdown pipe table is the one markdown we read.
      handlePaste: (_view, event) => {
        const ed = editorRef.current;
        const text = event.clipboardData?.getData('text/plain') ?? '';
        const rows = parsePastedPipeTable(text);
        if (!ed || !rows || ed.isActive('table')) return false;
        const nodes = markupToDoc(buildPipeTableLines(rows).join('\n')).content;
        event.preventDefault();
        ed.chain().focus().insertContent(nodes).run();
        return true;
      },
    },
  });
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);
  // The composer's <label for> must land on whichever control is showing: the editor
  // surface in Preview (a div cannot be labelled natively, so a click on the label
  // focuses it), the textarea in Source. Exactly one element carries the id.
  useEffect(() => {
    if (!editor || editor.isDestroyed || mode !== 'preview') return;
    const dom = editor.view.dom;
    dom.setAttribute('id', id);
    const labels = Array.from(document.querySelectorAll<HTMLElement>(`label[for="${id}"]`));
    const focusEditor = () => void editor.commands.focus();
    labels.forEach((l) => l.addEventListener('click', focusEditor));
    return () => {
      labels.forEach((l) => l.removeEventListener('click', focusEditor));
      dom.removeAttribute('id');
    };
  }, [editor, id, mode]);
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.setEditable(!disabled);
  }, [editor, disabled]);

  // A value the editor did not produce replaces what it shows.
  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    setSource(value);
    if (editor && !editor.isDestroyed) {
      editor.commands.setContent(markupToDoc(value), { emitUpdate: false });
    }
  }, [value, editor]);

  useLayoutEffect(() => {
    const sel = pendingSelection.current;
    const el = sourceRef.current;
    if (sel && el) {
      pendingSelection.current = null;
      el.focus();
      el.setSelectionRange(sel[0], sel[1]);
    }
  }, [source]);

  const { fmt: previewState, inTable } = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      fmt: ed ? formatStateOfEditor(ed) : emptyFormatState,
      inTable: ed ? ed.isActive('table') : false,
    }),
  });

  // Switching moves focus into the new surface, so the focus-gated bar (and the toggle) stays.
  // Compared against the mode last seen, not a "first run" flag: StrictMode runs effects twice on
  // mount, and mount must not steal focus (the editor may even be mid-recreate then).
  const seenMode = useRef(mode);
  useEffect(() => {
    if (seenMode.current === mode) return;
    seenMode.current = mode;
    if (mode === 'source') sourceRef.current?.focus();
    else if (editor && !editor.isDestroyed) editor.commands.focus();
  }, [mode, editor]);

  function switchMode(next: Mode) {
    if (next === mode) return;
    if (next === 'preview') {
      const clean = sanitizeMarkup(source);
      setDropped(droppedMarkup(source));
      lastEmitted.current = clean;
      onChangeRef.current(clean);
      if (editor && !editor.isDestroyed) {
        editor.commands.setContent(markupToDoc(clean), { emitUpdate: false });
      }
    } else {
      setSource(value);
      setDropped(false);
    }
    setMode(next);
  }

  function editSource(next: string, selection?: [number, number]) {
    const clean = sanitizeMarkup(next);
    lastEmitted.current = clean;
    pendingSelection.current = selection ?? null;
    setSource(next);
    onChangeRef.current(clean);
  }

  function wrap(tag: SourceTag) {
    const el = sourceRef.current;
    const from = el?.selectionStart ?? source.length;
    const to = el?.selectionEnd ?? source.length;
    const edit = wrapSourceSelection(source, from, to, sourceTagPair(tag));
    editSource(edit.value, [edit.start, edit.end]);
  }

  const previewCommands: MailEditorCommands = {
    state: previewState,
    canClear: true,
    canLink: !inTable,
    canReset: true,
    toggleMark: (mark) => void editor?.chain().focus().toggleMark(mark).run(),
    setColor: (color) => {
      const chain = editor?.chain().focus();
      void (
        color === null ? chain?.unsetMark('eveColor') : chain?.setMark('eveColor', { color })
      )?.run();
    },
    setSize: (px) => {
      const chain = editor?.chain().focus();
      void (px === null ? chain?.unsetMark('eveSize') : chain?.setMark('eveSize', { px }))?.run();
    },
    linkTarget: () =>
      editor ? linkTargetOfEditor(editor) : { from: 0, to: 0, text: '', href: null },
    setLink: (target, edit) => {
      if (!editor || editor.isDestroyed) return;
      if (target.markOnly) {
        // Spans blocks or cells: add the mark, leave the text and structure alone.
        const link = editor.schema.marks.link.create({ href: edit.href });
        const { tr } = editor.state;
        for (const [from, to] of target.ranges ?? [[target.from, target.to]]) {
          tr.addMark(from, to, link);
        }
        editor.view.dispatch(tr);
        editor.commands.focus();
        return;
      }
      // Keep the other marks (bold, colour, size) of the first character replaced.
      const marks = [
        ...linkCarryMarks(editor, target.from),
        { type: 'link', attrs: { href: edit.href } },
      ];
      editor
        .chain()
        .focus()
        .insertContentAt(
          { from: target.from, to: target.to },
          { type: 'text', text: edit.text, marks }
        )
        .run();
    },
    removeLink: (target) => {
      if (!editor || editor.isDestroyed) return;
      const link = editor.schema.marks.link;
      const { tr } = editor.state;
      for (const [from, to] of target.ranges ?? [[target.from, target.to]]) {
        tr.removeMark(from, to, link);
      }
      editor.view.dispatch(tr);
      editor.commands.focus();
    },
    insertTable: (rows, cols) =>
      void editor?.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run(),
    clearFormatting: () => void editor?.chain().focus().unsetAllMarks().run(),
  };

  const sourceCommands: MailEditorCommands = {
    state: emptyFormatState,
    canClear: false,
    canLink: true,
    canReset: false,
    toggleMark: (mark) => wrap(SOURCE_TAG[mark]),
    setColor: (color) => color !== null && wrap({ kind: 'color', color }),
    setSize: (px) => px !== null && wrap({ kind: 'size', px }),
    linkTarget: () => {
      const el = sourceRef.current;
      return sourceLinkAt(
        source,
        el?.selectionStart ?? source.length,
        el?.selectionEnd ?? source.length
      );
    },
    setLink: (target, edit) => {
      const result = planSourceLink(source, target.from, target.to, edit);
      editSource(result.value, [result.start, result.end]);
    },
    insertTable: (rows, cols) => {
      const el = sourceRef.current;
      const at = el?.selectionStart ?? source.length;
      const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''));
      const lead = at > 0 && source[at - 1] !== '\n' ? '\n' : '';
      const insert = `${lead}${buildPipeTableLines(grid).join('\n')}\n`;
      editSource(source.slice(0, at) + insert + source.slice(at), [
        at + insert.length,
        at + insert.length,
      ]);
    },
    clearFormatting: () => undefined,
  };

  const inSource = mode === 'source';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {dropped && !inSource && (
        <p role="status" className="text-xs text-text-dim">
          {t('mail.format.sourceDropped')}
        </p>
      )}
      {inSource && droppedMarkup(source) && (
        <p role="status" className="text-xs text-text-dim">
          {t('mail.format.sourceWillDrop')}
        </p>
      )}
      {/* One card: the bar is its top strip, then the surface. */}
      <div
        data-mail-card
        className={cx(EVE_MAIL_SURFACE_FRAME_CLASS, 'flex min-h-0 flex-1 flex-col', className)}
      >
        <MailFormatBar
          commands={inSource ? sourceCommands : previewCommands}
          phone={phone}
          disabled={disabled}
          sourceActive={inSource}
          onToggleSource={() => switchMode(inSource ? 'preview' : 'source')}
        />
        <div
          className={cx(
            'min-h-0 flex-1 overflow-y-auto p-3 text-xs leading-normal break-words whitespace-pre-wrap',
            inSource ? 'hidden' : 'flex flex-col'
          )}
          // Editable fills the box via flex, not `min-h-full` (Reply's card has no
          // definite height), so a tap lands in it natively and the keyboard opens.
          onClick={(e) => {
            if (!editor || editor.isDestroyed || !(e.target instanceof Node)) return;
            if (editor.view.dom.contains(e.target)) return;
            if (editor.view.hasFocus() && !editor.state.selection.empty) return;
            editor.commands.focus('end');
          }}
        >
          <EditorContent editor={editor} className="flex flex-1 flex-col" />
        </div>
        {inSource && (
          <TextArea
            bare
            mono
            ref={sourceRef}
            id={id}
            aria-label={t('mail.format.sourceLabel')}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            value={source}
            disabled={disabled}
            onChange={(e) => editSource(e.target.value)}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            className="min-h-0 flex-1 resize-none p-3 text-xs"
          />
        )}
        {counter && <div className="flex shrink-0 justify-end px-3 pb-1.5">{counter}</div>}
      </div>
    </div>
  );
}
