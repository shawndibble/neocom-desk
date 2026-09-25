/**
 * Builds the text behind each Export menu entry (issue #1543). The pure
 * formats live in `engine/fittings/fittingExport.ts`; this adds what they
 * can't know — item names from the SDE, and the Share Link's encoder and URL.
 */
import { encodeFittingShare } from '@/engine/fitting/fittingShare';
import {
  fittingToChatLink,
  fittingToEft,
  fittingToEveXml,
  fittingToMultibuy,
} from '@/engine/fittings/fittingExport';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import type { Fitting } from '@/engine/fittings/types';
import { loadTypes } from '@/sde/loadSde';

export type FittingExportKind = 'shareLink' | 'eft' | 'chatLink' | 'multibuy' | 'eveXml';

/** The Fittings page's own URL with the Fitting in `?f=` — what the address bar holds while it's open. */
export function fittingShareUrl(payload: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const query = new URLSearchParams({ f: payload }).toString();
  return `${window.location.origin}${base}/fittings?${query}`;
}

/** The text to copy, or null when a Share Link can't be made (the Fitting is too large to encode). */
export async function exportFitting(
  kind: FittingExportKind,
  fitting: Fitting
): Promise<string | null> {
  if (kind === 'shareLink') {
    const encoded = await encodeFittingShare(fittingToShareInput(fitting));
    return encoded.ok ? fittingShareUrl(encoded.payload) : null;
  }
  if (kind === 'chatLink') return fittingToChatLink(fitting);

  const types = await loadTypes();
  const nameFor = (typeId: number) => types[String(typeId)]?.name ?? `Type ${typeId}`;
  if (kind === 'eveXml') return fittingToEveXml(fitting, nameFor);
  return kind === 'eft' ? fittingToEft(fitting, nameFor) : fittingToMultibuy(fitting, nameFor);
}
