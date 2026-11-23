/**
 * The Mail widget on All characters: each Character's board (`loadMailBoard`) folded into
 * one. Pure, so the folding is tested apart from the reads.
 */
import type { MailBoardData } from './boardData';

/** The unread rows the widget lists, and the inbox rows its Table view lists at its tallest (`loadMailBoard` keeps the same). */
export const RECENT_ROWS = 4;
export const INBOX_ROWS = 12;

/** Newest first, a mail sent to several of the Characters once (its first owner), cut to `limit`. */
function newest<T extends { mailId: number; atMs: number | null }>(
  lists: readonly (readonly T[] | undefined)[],
  limit: number
): T[] {
  const seen = new Set<number>();
  return lists
    .flatMap((list) => list ?? [])
    .sort((a, b) => (b.atMs ?? -Infinity) - (a.atMs ?? -Infinity))
    .filter((mail) => !seen.has(mail.mailId) && !!seen.add(mail.mailId))
    .slice(0, limit);
}

export function mergeMailBoards(boards: readonly MailBoardData[]): MailBoardData {
  const reads = boards.flatMap((board) => (board.fetchedAt ? [board.fetchedAt.getTime()] : []));
  return {
    // Each inbox keeps its own unread count: a mail sent to two Characters is unread in both.
    unread: boards.reduce((sum, board) => sum + board.unread, 0),
    recent: newest(
      boards.map((board) => board.recent),
      RECENT_ROWS
    ),
    inbox: newest(
      boards.map((board) => board.inbox),
      INBOX_ROWS
    ),
    needsReauth: boards.length > 0 && boards.every((board) => board.needsReauth),
    fetchedAt: reads.length > 0 ? new Date(Math.min(...reads)) : null,
  };
}
