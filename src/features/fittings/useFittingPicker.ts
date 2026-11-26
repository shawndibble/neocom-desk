import { useCallback, useState } from 'react';
import { encodeFittingShare } from '@/engine/fittings/fittingShare';
import type { LoadedFitting, LoadOutcome } from '@/engine/fittings/load';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import type { Fitting } from '@/engine/fittings/types';
import { loadFittingFromText } from './loadFittingFromText';
import { resolveFittingXmlDocument } from './fittingXmlList';
import type { FittingWorkspace } from './useFittingWorkspace';

export type FittingLibrarySource = Pick<
  FittingWorkspace,
  | 'lastLoad'
  | 'shareError'
  | 'tooLargeToShare'
  | 'loadFromInput'
  | 'loadFittingXmlDocument'
  | 'openLoaded'
  | 'openSaved'
>;

export function useFittingPicker(onPick: (code: string) => void): FittingLibrarySource {
  const [lastLoad, setLastLoad] = useState<LoadOutcome | null>(null);
  const [tooLargeToShare, setTooLargeToShare] = useState(false);

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
      setTooLargeToShare(false);
      const outcome = await loadFittingFromText(text);
      if (outcome.kind === 'share') {
        setLastLoad(null);
        onPick(outcome.code);
        return;
      }
      setLastLoad(outcome);
      if (outcome.kind === 'fitting') await pickFitting(outcome.fitting);
    },
    [onPick, pickFitting]
  );

  const openLoaded = useCallback(
    async (loaded: LoadedFitting) => {
      setLastLoad(loaded);
      setTooLargeToShare(false);
      await pickFitting(loaded.fitting);
    },
    [pickFitting]
  );

  const openSaved = useCallback((record: { code: string }) => onPick(record.code), [onPick]);

  return {
    lastLoad,
    shareError: null,
    tooLargeToShare,
    loadFromInput,
    loadFittingXmlDocument: resolveFittingXmlDocument,
    openLoaded,
    openSaved,
  };
}
