import { useCallback, useState } from 'react';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MARKET_TABS } from '@/app/pageTabs';
import { tabPath } from '@/lib/pageTabs';
import { writeToClipboard } from '@/lib/clipboard';
import { downloadTextFile } from '@/lib/download';
import type { IndustryFitImportState, MarketAppraiseState } from '@/lib/shortcuts';
import type { Fitting } from '@/engine/fittings/types';
import { fittingSharePayload } from '@/engine/fittings/fittingSharePayload';
import { createShareLink, existingShareLink } from '@/features/share/shareStore';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { isSyncConfigured } from '@/app/syncStatus';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import type { EsiEndpointId } from '@/esi/registry';
import { ownedAtPlace } from '@/engine/market/appraisalOwned';
import { loadAllCharactersAssets } from '@/features/assets/assets';
import { loadStationName } from '@/features/character/stations';
import { loadStructureNameNoRoster } from '@/features/character/structures';
import { useAppraisalOwnedPref } from '@/features/market/appraisalOwnedPref';
import { loadHubFor } from '@/features/market/hub';
import { TRADE_HUBS, getTradeHub } from '@/market/hubs';
import {
  exportFitting,
  fittingShareCode,
  fittingShareViewUrl,
  type FittingExportKind,
} from './fittingExportText';
import { isOnline } from '@/stores/network';
import { useTimedToast, NOTICE_MS } from '@/components/ui/useTimedToast';

const ASSETS_ENDPOINTS: readonly EsiEndpointId[] = ['getCharacterAssets'];

export function useFittingExport(fitting: Fitting, cloneImplants: readonly number[] = []) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const lacksAssets = useCharacterLacksEndpoints(characterId, ASSETS_ENDPOINTS);
  const canSubtractOwned = characterId !== null && !lacksAssets;
  const [notice, setNotice] = useState<string | null>(null);

  const encode = useCallback(() => fittingShareCode(fitting), [fitting]);
  const encoded = useAsyncLoad(encode);

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

  async function copyMultibuyMinusOwned() {
    try {
      const ownedPref = useAppraisalOwnedPref.getState();
      const [, appraisalHubId] = await Promise.all([ownedPref.hydrate(), loadHubFor('appraisal')]);
      const appraisalHubStation = getTradeHub(appraisalHubId)?.stationId;
      const stationId = useAppraisalOwnedPref.getState().value.stationId ?? appraisalHubStation;
      if (stationId === undefined) {
        setNotice(t('fittings.export.copyFailed'));
        return;
      }
      const { entries } = await loadAllCharactersAssets();
      const lists = entries.map((entry) => entry.assets);
      const owned = ownedAtPlace(lists, stationId);
      const hub = TRADE_HUBS.find((h) => h.stationId === stationId);
      const isStructure = lists.some((assets) =>
        assets.some((a) => a.location_type === 'other' && a.location_id === stationId)
      );
      const placeName =
        hub?.systemName ??
        (isStructure
          ? await loadStructureNameNoRoster(
              entries.find((entry) =>
                entry.assets.some((a) => a.location_type === 'other' && a.location_id === stationId)
              )?.characterId ?? 0,
              stationId
            )
          : await loadStationName(stationId)) ??
        t('market.appraisal.minusOwnedUnknownStructure', { id: stationId });
      const text = await exportFitting('multibuy', fitting, cloneImplants, owned);
      if (text === null) return;
      if (text === '') {
        setNotice(t('fittings.export.allOwned'));
        return;
      }
      await writeToClipboard(text);
      setNotice(t('fittings.export.copied.multibuyMinusOwned', { station: placeName }));
    } catch {
      setNotice(t('fittings.export.copyFailed'));
    }
  }

  async function copyShareLink() {
    const code = encoded.status === 'ready' ? encoded.data : await fittingShareCode(fitting);
    if (code === null) {
      setNotice(t('fittings.export.tooLarge'));
      return;
    }
    let url = existingShareLink('fitting', code);
    const copyPermanentInstead = async (noticeKey: string) => {
      try {
        await writeToClipboard(fittingShareViewUrl(code));
        setNotice(t(noticeKey));
      } catch {
        setNotice(t('fittings.export.copyFailed'));
      }
    };
    if (url === null && !isOnline()) {
      await copyPermanentInstead('fittings.export.copied.permanentLinkOffline');
      return;
    }
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
        await copyPermanentInstead('fittings.export.copied.permanentLinkFallback');
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

  async function downloadEveXml() {
    try {
      const text = await exportFitting('eveXml', fitting);
      if (text === null) return;
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
