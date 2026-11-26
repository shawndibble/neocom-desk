import { EsiError } from '@/esi/errors';

export const isDefiniteRejection = (err: unknown) =>
  err instanceof EsiError && err.status >= 400 && err.status < 500;

const CONFIRM_ATTEMPTS = 3;

export type MailSettlement = 'sent' | 'refused' | 'unsure';

export async function sendAndSettle(calls: {
  send: () => Promise<unknown>;
  release: () => Promise<unknown>;
  confirm: () => Promise<unknown>;
}): Promise<MailSettlement> {
  try {
    await calls.send();
  } catch (err) {
    if (!isDefiniteRejection(err)) return 'unsure';
    await calls.release().catch(() => undefined);
    return 'refused';
  }
  for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt += 1) {
    try {
      await calls.confirm();
      break;
    } catch {}
  }
  return 'sent';
}
