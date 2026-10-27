import type { FormatState, LinkTarget } from '@/engine/mail/mailFormat';

export type ToggleMark = 'bold' | 'italic' | 'underline';

/**
 * What the format bar can do, whichever surface is behind it: the Preview
 * (Tiptap) implements these as editor commands, the Source view as tag
 * wrapping around the textarea selection.
 */
export interface MailEditorCommands {
  /** Active state at the caret / over the selection. */
  state: FormatState;
  toggleMark: (mark: ToggleMark) => void;
  /** `#aarrggbb`, always opaque; `null` returns to the game's default colour. */
  setColor: (color: string | null) => void;
  /** Pixels within the markup range; `null` returns to the default size. */
  setSize: (px: number | null) => void;
  /** What a link edit would replace now: the selection, the caret, or the link under either. */
  linkTarget: () => LinkTarget;
  /** Replaces `target` (what `linkTarget()` returned when the sheet opened) with `text` carrying the (already validated) http(s) `href`. */
  setLink: (target: LinkTarget, edit: { text: string; href: string }) => void;
  /** Removes the link in `target`, keeping its text. Absent where that cannot be done (Source). */
  removeLink?: (target: LinkTarget) => void;
  insertTable: (rows: number, cols: number) => void;
  clearFormatting: () => void;
  /**
   * Whether "back to default" (default colour, normal size, remove link) does anything.
   * Source view has no such edit: it would have to untangle tags around the selection.
   */
  canReset: boolean;
  /** Whether a link can be applied here; false inside a table cell (cells hold plain text). */
  canLink: boolean;
  /** Source view has no "clear": it would have to untangle tags around the selection. */
  canClear: boolean;
}
