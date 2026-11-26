import type { FormatState, LinkTarget } from '@/engine/mail/mailFormat';

export type ToggleMark = 'bold' | 'italic' | 'underline';

export interface MailEditorCommands {
  state: FormatState;
  toggleMark: (mark: ToggleMark) => void;
  setColor: (color: string | null) => void;
  setSize: (px: number | null) => void;
  linkTarget: () => LinkTarget;
  setLink: (target: LinkTarget, edit: { text: string; href: string }) => void;
  removeLink?: (target: LinkTarget) => void;
  insertTable: (rows: number, cols: number) => void;
  clearFormatting: () => void;
  canReset: boolean;
  canLink: boolean;
  canClear: boolean;
}
