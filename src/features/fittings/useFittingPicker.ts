/**
 * The "Compare with…" side of `FittingLibrary`: the same ways in as the
 * workspace (Load, My Fittings, In-game Fittings), but a chosen Fitting is
 * handed back as a Share Link code instead of being opened in the editor.
 * My Fittings already carries a code; every other source needs one round of
 * `encodeFittingShare` first.
 */
import { useCallback, useState } from 'react';
import { encodeFittingShare } from '@/engine/fitting/fittingShare';
import type { EftUnresolvedItem } from '@/engine/fittings/eftLoader';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import type { Fitting } from '@/engine/fittings/types';
import type { FitXmlUnresolvedItem } from '@/engine/import/eveFitXml';
import { loadFittingFromText, type LoadError } from './loadFittingFromText';
import {
  resolveFittingXmlDocument,
  type FittingWorkspace,
  type FittingXmlListItem,
} from './useFittingWorkspace';

/** The slice of the workspace `FittingLibrary` drives; the picker supplies its own. */
export type FittingLibrarySource = Pick<
  FittingWorkspace,
  | 'unresolved'
  | 'fitXmlUnresolved'
  | 'shareError'
  | 'loadError'
  | 'tooLargeToShare'
  | 'loadFromInput'
  | 'loadFittingXmlDocument'
  | 'openFittingXmlEntry'
  | 'openFitting'
  | 'openSaved'
>;

export function useFittingPicker(onPick: (code: string) => void): FittingLibrarySource {
  const [unresolved, setUnresolved] = useState<EftUnresolvedItem[]>([]);
  const [fitXmlUnresolved, setFitXmlUnresolved] = useState<FitXmlUnresolvedItem[]>([]);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [tooLargeToShare, setTooLargeToShare] = useState(false);

  /** Picks a Fitting if it fits a Share Link; otherwise flags it too large. */
  const pickFitting = useCallback(
    async (fitting: Fitting) => {
      const encoded = await encodeFittingShare(fittingToShareInput(fitting));
      setTooLargeToShare(!encoded.ok);
      if (encoded.ok) onPick(encoded.payload);
    },
    [onPick]
  );

  const loadFromInput = useCallback(
    async (text: string) => {
      setLoadError(null);
      setFitXmlUnresolved([]);
      setTooLargeToShare(false);
      const result = await loadFittingFromText(text);
      if (result.shareCode !== null) {
        setUnresolved([]);
        onPick(result.shareCode);
        return;
      }
      setUnresolved(result.unresolved);
      if (result.error !== null) {
        setLoadError(result.error);
        return;
      }
      if (result.fitting !== null) await pickFitting(result.fitting);
    },
    [onPick, pickFitting]
  );

  const openFittingXmlEntry = useCallback(
    async (item: FittingXmlListItem) => {
      if (item.fitting === null) return;
      setUnresolved([]);
      setFitXmlUnresolved(item.unresolved);
      setTooLargeToShare(false);
      await pickFitting(item.fitting);
    },
    [pickFitting]
  );

  const openFitting = useCallback(
    async (fitting: Fitting) => {
      setTooLargeToShare(false);
      await pickFitting(fitting);
    },
    [pickFitting]
  );

  const openSaved = useCallback((record: { code: string }) => onPick(record.code), [onPick]);

  return {
    unresolved,
    fitXmlUnresolved,
    shareError: null,
    loadError,
    tooLargeToShare,
    loadFromInput,
    loadFittingXmlDocument: resolveFittingXmlDocument,
    openFittingXmlEntry,
    openFitting,
    openSaved,
  };
}
