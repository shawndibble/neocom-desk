import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MARKET_TABS } from '@/app/pageTabs';
import { tabPath } from '@/lib/pageTabs';
import { writeToClipboard } from '@/lib/clipboard';
import type { MarketAppraiseState } from '@/lib/shortcuts';
import type { Fitting } from '@/engine/fittings/types';
import { exportFitting, type FittingExportKind } from './fittingExportText';

const NOTICE_MS = 2500;

/**
 * What Export does — copy a format, open Appraisal — and the brief notice
 * a copy leaves. Shared by the Export menu and the phone header's one menu.
 */
export function useFittingExport(fitting: Fitting) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  async function copy(kind: FittingExportKind) {
    try {
      const text = await exportFitting(kind, fitting);
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

  async function openInAppraisal() {
    const text = await exportFitting('multibuy', fitting);
    if (text === null) return;
    navigate(tabPath(MARKET_TABS, 'appraisal'), {
      state: { appraiseText: text } satisfies MarketAppraiseState,
    });
  }

  return { notice, copy, openInAppraisal };
}

export type FittingExport = ReturnType<typeof useFittingExport>;
