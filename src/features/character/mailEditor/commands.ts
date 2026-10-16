import type { FormatState } from '@/engine/mailFormat';

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
  /** An http(s) address; `null` removes the link at the caret/selection. */
  setLink: (href: string | null) => void;
  insertTable: (rows: number, cols: number) => void;
  clearFormatting: () => void;
  /** Source view has no "clear": it would have to untangle tags around the selection. */
  canClear: boolean;
}
