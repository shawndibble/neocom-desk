import { plainTextToMarkup } from './mailEditorDoc';

export type MailTab = 'inbox' | 'sent' | 'corp' | 'alliance';

interface SystemLabel {
  label_id: number;
  name?: string;
  unread_count?: number;
}

const NAME_TO_TAB: Readonly<Record<string, MailTab>> = {
  inbox: 'inbox',
  sent: 'sent',
  corp: 'corp',
  alliance: 'alliance',
};

const TAB_PRECEDENCE: readonly MailTab[] = ['sent', 'alliance', 'corp', 'inbox'];

export function buildLabelTabMap(labels: readonly SystemLabel[]): ReadonlyMap<number, MailTab> {
  const map = new Map<number, MailTab>();
  for (const label of labels) {
    const tab = label.name ? NAME_TO_TAB[label.name.trim().toLowerCase()] : undefined;
    if (tab) map.set(label.label_id, tab);
  }
  return map;
}

export function customLabelNames(
  labelIds: readonly number[] | undefined,
  labels: readonly SystemLabel[],
  labelTabById: ReadonlyMap<number, MailTab>
): string[] {
  const nameById = new Map(labels.map((l) => [l.label_id, l.name?.trim()]));
  const names: string[] = [];
  for (const id of labelIds ?? []) {
    if (labelTabById.has(id)) continue;
    const name = nameById.get(id);
    if (name) names.push(name);
  }
  return names;
}

export function resolveMailTab(
  labelIds: readonly number[] | undefined,
  labelTabById: ReadonlyMap<number, MailTab>
): MailTab {
  const tabs = new Set(
    (labelIds ?? [])
      .map((id) => labelTabById.get(id))
      .filter((tab): tab is MailTab => tab !== undefined)
  );
  for (const tab of TAB_PRECEDENCE) {
    if (tabs.has(tab)) return tab;
  }
  return 'inbox';
}

export function unreadCountsByTab(labels: readonly SystemLabel[]): ReadonlyMap<MailTab, number> {
  const map = new Map<MailTab, number>();
  for (const label of labels) {
    const tab = label.name ? NAME_TO_TAB[label.name.trim().toLowerCase()] : undefined;
    if (tab) map.set(tab, label.unread_count ?? 0);
  }
  return map;
}

interface MailHeaderLike {
  mail_id: number;
}

export interface MergedMailHeaderPage<H extends MailHeaderLike> {
  headers: H[];
  hasMore: boolean;
}

export const MAIL_HEADERS_PAGE_SIZE = 50;

export function mergeMailHeaderPage<H extends MailHeaderLike>(
  existing: readonly H[],
  page: readonly H[],
  pageSize: number = MAIL_HEADERS_PAGE_SIZE
): MergedMailHeaderPage<H> {
  const byId = new Map<number, H>(existing.map((header) => [header.mail_id, header]));
  for (const header of page) byId.set(header.mail_id, header);
  return { headers: Array.from(byId.values()), hasMore: page.length >= pageSize };
}

interface MailSearchable {
  subject?: string;
}

export function mailSearchMatches(
  header: MailSearchable,
  senderName: string | undefined,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  if ((header.subject ?? '').toLowerCase().includes(q)) return true;
  return (senderName ?? '').toLowerCase().includes(q);
}

export const MAIL_HEADER_DISPLAY_CAP = 200;

export interface CappedHeaders<H> {
  headers: H[];
  truncated: boolean;
}

export function capHeadersForDisplay<H>(
  headers: readonly H[],
  cap: number = MAIL_HEADER_DISPLAY_CAP
): CappedHeaders<H> {
  if (headers.length <= cap) return { headers: [...headers], truncated: false };
  return { headers: headers.slice(0, cap), truncated: true };
}

export const MAIL_FOLDERS: readonly MailTab[] = ['inbox', 'corp', 'alliance', 'sent'];

export function parseMailFolders(raw: unknown): MailTab[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const isTab = (value: unknown): value is MailTab =>
    typeof value === 'string' && (MAIL_FOLDERS as readonly string[]).includes(value);
  return raw.every(isTab) ? (raw as MailTab[]) : null;
}

interface RecipientLike {
  recipient_id: number;
  recipient_type: 'alliance' | 'character' | 'corporation' | 'mailing_list';
}

interface ReplyAllSource {
  from?: number;
  recipients?: readonly RecipientLike[];
}

export type ReplyRecipient = RecipientLike & { removable: boolean };

export function buildReplyAllRecipients(
  header: ReplyAllSource,
  ownCharacterId: number
): ReplyRecipient[] {
  const out: ReplyRecipient[] = [];
  const seen = new Set<string>();
  const add = (recipient: RecipientLike, removable: boolean) => {
    const key = `${recipient.recipient_type}:${recipient.recipient_id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...recipient, removable });
  };

  if (header.from !== undefined && header.from !== ownCharacterId) {
    add({ recipient_id: header.from, recipient_type: 'character' }, false);
  }
  for (const recipient of header.recipients ?? []) {
    if (recipient.recipient_type === 'character' && recipient.recipient_id === ownCharacterId) {
      continue;
    }
    add(recipient, true);
  }
  return out;
}

export const QUOTE_SEPARATOR = '-'.repeat(32);

export type ComposeKind = 'reply' | 'forward';

const SUBJECT_PREFIX: Readonly<Record<ComposeKind, string>> = {
  reply: 'RE:',
  forward: 'FWD:',
};

export function prefixSubject(kind: ComposeKind, subject: string): string {
  const prefix = SUBJECT_PREFIX[kind];
  const trimmed = subject.trim();
  if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) return trimmed;
  return trimmed === '' ? prefix : `${prefix} ${trimmed}`;
}

export function quoteMailBody(
  senderName: string,
  formattedTimestamp: string,
  body: string
): string {
  return `\n\n${QUOTE_SEPARATOR}\nFrom: ${senderName}\nSent: ${formattedTimestamp}\n\n${body}`;
}

export interface OwnedMail<H extends MailHeaderLike> {
  ownerId: number;
  ownerName: string;
  header: H;
}

export function mailKey(ownerId: number, mailId: number): string {
  return `${ownerId}:${mailId}`;
}

export function mergeOwnedMail<H extends MailHeaderLike & { timestamp?: string }>(
  sources: readonly { characterId: number; characterName: string; headers: readonly H[] }[]
): OwnedMail<H>[] {
  return sources
    .flatMap((source) =>
      source.headers.map((header) => ({
        ownerId: source.characterId,
        ownerName: source.characterName,
        header,
      }))
    )
    .sort((a, b) => (b.header.timestamp ?? '').localeCompare(a.header.timestamp ?? ''));
}

export function totalSystemUnread(labels: readonly SystemLabel[]): number {
  let total = 0;
  for (const count of unreadCountsByTab(labels).values()) total += count;
  return total;
}

export function sumUnreadByTab(
  labelSets: readonly (readonly SystemLabel[])[]
): ReadonlyMap<MailTab, number> {
  const sums = new Map<MailTab, number>();
  for (const labels of labelSets) {
    for (const [tab, count] of unreadCountsByTab(labels)) {
      sums.set(tab, (sums.get(tab) ?? 0) + count);
    }
  }
  return sums;
}

interface DeltaRow {
  key: string;
  tab: MailTab;
  header: { is_read?: boolean };
}

export function unreadDeltaByTab(
  rows: readonly DeltaRow[],
  locallyReadKeys: ReadonlySet<string>,
  locallyUnreadKeys: ReadonlySet<string>,
  deletedKeys: ReadonlySet<string>
): ReadonlyMap<MailTab, number> {
  const delta = new Map<MailTab, number>();
  for (const row of rows) {
    const wasUnread = !row.header.is_read;
    const isUnread = deletedKeys.has(row.key)
      ? false
      : locallyUnreadKeys.has(row.key)
        ? true
        : !(row.header.is_read || locallyReadKeys.has(row.key));
    if (wasUnread !== isUnread) delta.set(row.tab, (delta.get(row.tab) ?? 0) + (isUnread ? 1 : -1));
  }
  return delta;
}

export function applyUnreadDelta(
  counts: ReadonlyMap<MailTab, number>,
  delta: ReadonlyMap<MailTab, number>
): ReadonlyMap<MailTab, number> {
  if (delta.size === 0) return counts;
  const out = new Map(counts);
  for (const [tab, change] of delta) out.set(tab, Math.max(0, (out.get(tab) ?? 0) + change));
  return out;
}

export function selectMailBodiesToPrefetch(
  headers: ReadonlyArray<{ mail_id: number; from?: number; is_read?: boolean }>,
  options: { ownerId: number; cachedIds: ReadonlySet<number>; limit: number }
): number[] {
  const ordered = headers
    .filter((header) => header.from !== options.ownerId)
    .sort((a, b) => {
      const readRankA = a.is_read === true ? 1 : 0;
      const readRankB = b.is_read === true ? 1 : 0;
      return readRankA - readRankB || b.mail_id - a.mail_id;
    });
  return ordered
    .slice(0, Math.max(0, options.limit))
    .map((header) => header.mail_id)
    .filter((id) => !options.cachedIds.has(id));
}

export function forwardMailBody(
  senderName: string,
  formattedTimestamp: string,
  subject: string,
  originalMarkup: string
): string {
  const header = `\n\n---------- Forwarded message ----------\nFrom: ${senderName}\nDate: ${formattedTimestamp}\nSubject: ${subject}\n\n`;
  return plainTextToMarkup(header) + originalMarkup;
}
