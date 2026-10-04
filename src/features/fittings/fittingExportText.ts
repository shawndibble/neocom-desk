/**
 * Builds the text behind each Export menu entry (issue #1543). The pure
 * formats live in `engine/fittings/fittingExport.ts`; this adds what they
 * can't know — item names from the SDE, and the Fitting Share Code's encoder
 * and permanent URL.
 */
import { encodeFittingShare } from '@/engine/fitting/fittingShare';
import { fittingToEft, fittingToEveXml, fittingToMultibuy } from '@/engine/fittings/fittingExport';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import type { Fitting } from '@/engine/fittings/types';
import { loadTypes } from '@/sde/loadSde';
import { FITTINGS_PATH } from './fittingRoutes';

export type FittingExportKind = 'permanentLink' | 'eft' | 'multibuy' | 'eveXml';

/**
 * The Fittings tab's own URL with the Fitting in `?f=`, which opens it in the
 * editor. Links copied before the section became Ships read `/fittings?f=`
 * and still open (`legacyShipsLocation`).
 */
export function fittingShareUrl(payload: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const query = new URLSearchParams({ f: payload }).toString();
  return `${window.location.origin}${base}${FITTINGS_PATH}?${query}`;
}

/** The Fitting's **Fitting Share Code**, or null when it is too large to encode. */
export async function fittingShareCode(fitting: Fitting): Promise<string | null> {
  const encoded = await encodeFittingShare(fittingToShareInput(fitting));
  return encoded.ok ? encoded.payload : null;
}

/**
 * The text to copy, or null when a permanent link can't be made (the Fitting
 * is too large to encode). `cloneImplants` only trims the multibuy list — a
 * link or EFT is the whole Fitting, set and all.
 */
export async function exportFitting(
  kind: FittingExportKind,
  fitting: Fitting,
  cloneImplants: readonly number[] = []
): Promise<string | null> {
  if (kind === 'permanentLink') {
    const code = await fittingShareCode(fitting);
    return code === null ? null : fittingShareUrl(code);
  }

  const types = await loadTypes();
  const nameFor = (typeId: number) => types[String(typeId)]?.name ?? `Type ${typeId}`;
  if (kind === 'eveXml') return fittingToEveXml(fitting, nameFor);
  return kind === 'eft'
    ? fittingToEft(fitting, nameFor)
    : fittingToMultibuy(fitting, nameFor, cloneImplants);
}
