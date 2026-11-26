import type { Translate } from '@/lib/translate';
import { requiredScopesForEndpoints, SEND_MAIL_ENDPOINTS } from '@/esi/registry';
import { loadGrantedScopes } from '@/app/grantedScopes';

const SEND_MAIL_SCOPES = requiredScopesForEndpoints(SEND_MAIL_ENDPOINTS);

export function canSendMail(grantedScopes: readonly string[] | undefined): boolean {
  return grantedScopes !== undefined && SEND_MAIL_SCOPES.every((s) => grantedScopes.includes(s));
}

export interface MailRecipient {
  id: number;
  name: string;
}

export async function resolveRecipients(
  ids: readonly number[],
  known: ReadonlyMap<number, string> = new Map()
): Promise<MailRecipient[]> {
  const unknown = ids.filter((id) => !known.has(id));
  let looked = new Map<number, string>();
  if (unknown.length > 0) {
    try {
      const { resolveNames } = await import('@/features/character/names');
      looked = await resolveNames(unknown);
    } catch {}
  }
  return ids.map((id) => ({ id, name: known.get(id) ?? looked.get(id) ?? `#${id}` }));
}

export type OfficerMailOutcome =
  | { status: 'queued'; queued: number }
  | { status: 'no-scope' }
  | { status: 'none' }
  | { status: 'failed' };

export interface OfficerMailInput {
  senderCharacterId: number;
  grantedScopes?: readonly string[] | undefined;
  recipients: readonly number[] | (() => Promise<readonly number[]>);
  knownNames?: ReadonlyMap<number, string>;
  enqueue: (recipients: MailRecipient[]) => Promise<{ queued: number }>;
}

export async function queueOfficerMail(input: OfficerMailInput): Promise<OfficerMailOutcome> {
  try {
    const scopes = input.grantedScopes ?? [...(await loadGrantedScopes(input.senderCharacterId))];
    const { recipients } = input;
    if (typeof recipients !== 'function' && recipients.length === 0) return { status: 'none' };
    if (!canSendMail(scopes)) return { status: 'no-scope' };
    const found = typeof recipients === 'function' ? await recipients() : recipients;
    if (found.length === 0) return { status: 'none' };
    const { queued } = await input.enqueue(await resolveRecipients(found, input.knownNames));
    return { status: 'queued', queued };
  } catch {
    return { status: 'failed' };
  }
}

export interface MailRun {
  queued: string[];
  failed: string[];
  missingScope: boolean;
}

export function mailSummary(t: Translate, run: MailRun): string {
  if (run.missingScope) return t('srp.officer.mail.noScope');
  return [
    run.queued.length > 0 ? t('srp.officer.mail.queuedFor', { count: run.queued.length }) : '',
    run.failed.length > 0 ? t('srp.officer.mail.failedFor', { names: run.failed.join(', ') }) : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export async function officerCorporationName(corporationId: number): Promise<string | null> {
  try {
    const { loadPublicCorporationRecord } = await import('@/features/character/publicInfoData');
    return (await loadPublicCorporationRecord(corporationId))?.name ?? null;
  } catch {
    return null;
  }
}
