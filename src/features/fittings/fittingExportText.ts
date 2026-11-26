import { encodeFittingShare } from '@/engine/fittings/fittingShare';
import {
  fittingItemCounts,
  fittingToEft,
  fittingToEveXml,
  fittingToMultibuy,
} from '@/engine/fittings/fittingExport';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import type { Fitting } from '@/engine/fittings/types';
import { loadTypeNames } from '@/features/character/typeNames';
import { FITTINGS_PATH } from './fittingRoutes';
import { eftAttributeNamesFor } from '@/features/abyssal/mutaplasmidData';

export type FittingExportKind = 'permanentLink' | 'eft' | 'multibuy' | 'eveXml';

function fittingShareUrl(payload: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const query = new URLSearchParams({ f: payload }).toString();
  return `${window.location.origin}${base}${FITTINGS_PATH}?${query}`;
}

export function fittingShareViewUrl(payload: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const query = new URLSearchParams({ f: payload }).toString();
  return `${window.location.origin}${base}/share/fitting?${query}`;
}

export async function fittingShareCode(fitting: Fitting): Promise<string | null> {
  const encoded = await encodeFittingShare(fittingToShareInput(fitting));
  return encoded.ok ? encoded.payload : null;
}

export async function exportFitting(
  kind: FittingExportKind,
  fitting: Fitting,
  cloneImplants: readonly number[] = [],
  owned?: ReadonlyMap<number, number>
): Promise<string | null> {
  if (kind === 'permanentLink') {
    const code = await fittingShareCode(fitting);
    return code === null ? null : fittingShareUrl(code);
  }

  const names = await loadTypeNames([...fittingItemCounts(fitting, cloneImplants).keys()]);
  const nameFor = (typeId: number) => names.get(typeId) ?? `Type ${typeId}`;
  if (kind === 'eveXml') return fittingToEveXml(fitting, nameFor);
  return kind === 'eft'
    ? fittingToEft(fitting, nameFor, { attributeName: await eftAttributeNamesFor(fitting) })
    : fittingToMultibuy(fitting, nameFor, cloneImplants, owned);
}
