import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MARKET_TABS } from '@/app/pageTabs';
import { tabPath } from '@/lib/pageTabs';
import { writeToClipboard } from '@/lib/clipboard';
import { downloadTextFile } from '@/lib/download';
import type { IndustryFitImportState, MarketAppraiseState } from '@/lib/shortcuts';
import type { Fitting } from '@/engine/fittings/types';
import { fittingSharePayload } from '@/engine/fitting/fittingSharePayload';
import { createShareLink, existingShareLink } from '@/features/share/shareStore';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { isSyncConfigured } from '@/app/syncStatus';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import type { EsiEndpointId } from '@/esi/registry';
import { ownedAtStation } from '@/engine/market/appraisalOwned';
import { loadAllCharactersAssets } from '@/features/character/assets';
import { useAppraisalOwnedPref } from '@/features/market/appraisalOwnedPref';
import { useMarketHub } from '@/features/market/hub';
import { TRADE_HUBS, getTradeHub } from '@/market/hubs';
import { exportFitting, fittingShareCode, type FittingExportKind } from './fittingExportText';
import { useTimedToast, NOTICE_MS } from '@/components/ui/useTimedToast';

const ASSETS_ENDPOINTS: readonly EsiEndpointId[] = ['getCharacterAssets'];

/**
 * What Export does — copy a format, open Appraisal — and the brief notice
 * a copy leaves. Shared by the Export menu and the phone header's one menu.
 * `cloneImplants` (the pilot's active clone) stay off the multibuy list.
 */
export function useFittingExport(fitting: Fitting, cloneImplants: readonly number[] = []) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const lacksAssets = useCharacterLacksEndpoints(characterId, ASSETS_ENDPOINTS);
  const canSubtractOwned = characterId !== null && !lacksAssets;
  const [notice, setNotice] = useState<string | null>(null);

  // This Fitting's Fitting Share Code, encoded as it changes rather than on
  // the click — encoding awaits a compressor, and a copy after that await can
  // fall outside the click on Safari.
  const [encoded, setEncoded] = useState<{ fitting: Fitting; code: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fittingShareCode(fitting).then((code) => {
      if (!cancelled) setEncoded({ fitting, code });
    });
    return () => {
      cancelled = true;
    };
  }, [fitting]);

  useTimedToast(notice, () => setNotice(null), NOTICE_MS);

  async function copy(kind: FittingExportKind) {
    try {
      const text = await exportFitting(kind, fitting, cloneImplants);
      if (text === null) {
        setNotice(t('fittings.export.tooLarge'));
        return;
      }
      await writeToClipboard(text);
      setNotice(t(`fittings.export.copied.${kind}`));
    } catch {
      setNotice(t('fittings.export.copyFailed'));
    }
  }

  /**
   * The multibuy list less what every Character holds at the Appraisal's
   * "Minus owned" station (its saved pick, else the Market's hub).
   */
  async function copyMultibuyMinusOwned() {
    try {
      const ownedPref = useAppraisalOwnedPref.getState();
      const marketHub = useMarketHub.getState();
      await Promise.all([ownedPref.hydrate(), marketHub.hydrate()]);
      const marketHubStation = getTradeHub(useMarketHub.getState().value)?.stationId;
      const stationId = useAppraisalOwnedPref.getState().value.stationId ?? marketHubStation;
      const station = TRADE_HUBS.find((h) => h.stationId === stationId);
      if (stationId === undefined || !station) {
        setNotice(t('fittings.export.copyFailed'));
        return;
      }
      const { entries } = await loadAllCharactersAssets();
      const owned = ownedAtStation(
        entries.map((entry) => entry.assets),
        stationId
      );
      const text = await exportFitting('multibuy', fitting, cloneImplants, owned);
      if (text === null) return;
      if (text === '') {
        setNotice(t('fittings.export.allOwned'));
        return;
      }
      await writeToClipboard(text);
      setNotice(t('fittings.export.copied.multibuyMinusOwned', { station: station.systemName }));
    } catch {
      setNotice(t('fittings.export.copyFailed'));
    }
  }

  /**
   * The short, 7-day **Share Link**: the Fitting Share Code stored under a
   * `/s/<id>`. The same code shared again gets the same link. When saving
   * outlasts the click and the browser refuses the copy, the link is already
   * made — choosing it again copies it straight away, inside the click.
   */
  async function copyShareLink() {
    // The code encoded ahead of time keeps a reused link's copy free of any
    // await, so it stays inside the click — which is the whole retry path.
    const code = encoded?.fitting === fitting ? encoded.code : await fittingShareCode(fitting);
    if (code === null) {
      setNotice(t('fittings.export.tooLarge'));
      return;
    }
    let url = existingShareLink('fitting', code);
    if (url === null) {
      if (characterId === null || !isSyncConfigured()) {
        setNotice(t('fittings.export.shareFailed'));
        return;
      }
      try {
        url = await createShareLink({
          type: 'fitting',
          payload: fittingSharePayload(code),
          reuseKey: code,
          characterId,
        });
      } catch {
        setNotice(t('fittings.export.shareFailed'));
        return;
      }
    }
    try {
      await writeToClipboard(url);
      setNotice(t('fittings.export.copied.shareLink'));
    } catch {
      setNotice(t('fittings.export.shareCopyRetry'));
    }
  }

  /** The game's fittings XML, as a file — the fitting window imports it from disk. */
  async function downloadEveXml() {
    try {
      const text = await exportFitting('eveXml', fitting);
      if (text === null) return;
      // Characters a Windows filename can't hold.
      const filename = `${fitting.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'fitting'}.xml`;
      downloadTextFile(filename, text, 'application/xml;charset=utf-8');
      setNotice(t('fittings.export.downloaded.eveXml'));
    } catch {
      setNotice(t('fittings.export.downloadFailed'));
    }
  }

  async function openInAppraisal() {
    const text = await exportFitting('multibuy', fitting, cloneImplants);
    if (text === null) return;
    navigate(tabPath(MARKET_TABS, 'appraisal'), {
      state: { appraiseText: text } satisfies MarketAppraiseState,
    });
  }

  /**
   * Industry's Fit Import, without the copy/paste round-trip: the same EFT
   * text Export's own "Copy EFT" would put on the clipboard, handed straight
   * to the Fit Import dialog pre-filled and already parsed.
   */
  async function openManufacturePlan() {
    const text = await exportFitting('eft', fitting);
    if (text === null) return;
    navigate('/industry', {
      state: { fitImportText: text } satisfies IndustryFitImportState,
    });
  }

  return {
    notice,
    canSubtractOwned,
    copy,
    copyMultibuyMinusOwned,
    copyShareLink,
    downloadEveXml,
    openInAppraisal,
    openManufacturePlan,
  };
}

export type FittingExport = ReturnType<typeof useFittingExport>;
