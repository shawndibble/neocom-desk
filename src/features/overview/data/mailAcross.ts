import type { MailBoardData } from './boardData';

export const RECENT_ROWS = 4;
export const INBOX_ROWS = 12;

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
