import { useTranslation } from 'react-i18next';
import { textActionClassName } from '@/components/ui';
import { writeToClipboard } from '@/lib/clipboard';
import { useCopyFeedback } from '@/lib/useCopyFeedback';
import { attributeDiagnostics } from '@/features/skills/attributeDiagnostics';
import { acceleratorBonusOf, type AttributeBaseline } from '@/engine/attributeBaseline';
import type { Implants } from '@/engine/types';
import type { CharacterAttributes } from '@/esi/endpoints';
import { AttributeChips } from '@/features/skills/AttributeChips';
import type { CachedResult } from '../../data';

export function AttributesToolSection({
  attributesResult,
  implants,
  attributeBaseline,
}: {
  attributesResult: CachedResult<CharacterAttributes> | null;
  implants: Implants;
  attributeBaseline: AttributeBaseline | null;
}) {
  const { t } = useTranslation();
  const { copied, flash } = useCopyFeedback<'ok' | 'failed'>(2000);
  return (
    <div className="space-y-2 text-xs">
      <AttributeChips
        attributes={attributesResult?.data ?? null}
        implantBonuses={implants}
        boosterBonus={acceleratorBonusOf(attributeBaseline)}
        dense
        short
      />
      {attributeBaseline?.kind === 'impossible' && (
        <div className="space-y-1">
          <p className="text-warning">{t('plans.attributesImpossible')}</p>
          {attributesResult && (
            <button
              type="button"
              className={textActionClassName()}
              onClick={() =>
                void writeToClipboard(
                  attributeDiagnostics({
                    attributes: attributesResult.data,
                    implants,
                    baseline: attributeBaseline,
                    fetchedAt: attributesResult.fetchedAt,
                    fromCache: attributesResult.fromCache,
                  })
                ).then(
                  () => flash('ok'),
                  () => flash('failed')
                )
              }
            >
              {copied
                ? t('plans.attributesDiagnosticsCopied')
                : t('plans.attributesCopyDiagnostics')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
