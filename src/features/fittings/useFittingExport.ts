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
import { exportFitting, fittingShareCode, type FittingExportKind } from './fittingExportText';

const NOTICE_MS = 2500;

/**
 * What Export does — copy a format, open Appraisal — and the brief notice
 * a copy leaves. Shared by the Export menu and the phone header's one menu.
 * `cloneImplants` (the pilot's active clone) stay off the multibuy list.
 */
export function useFittingExport(fitting: Fitting, cloneImplants: readonly number[] = []) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
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

  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

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
   * The short, 7-day **Share Link**: the Fitting Share Code stored under a
   * `/share/<id>`. The same code shared again gets the same link. When saving
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

  return { notice, copy, copyShareLink, downloadEveXml, openInAppraisal, openManufacturePlan };
}

export type FittingExport = ReturnType<typeof useFittingExport>;
