import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { useStructureFees, withoutStructureFee } from './structureFees';

/**
 * Settings > Market fees: the structure broker fees the pilot has set. Renders
 * nothing until one exists (issue #2911) — the field itself lives on the Order
 * detail, so this is only where a fee is reviewed or removed.
 */
export function StructureFeesList() {
  const { t } = useTranslation();
  const fees = useStructureFees((state) => state.value);
  const setFees = useStructureFees((state) => state.setValue);
  useEffect(() => {
    void useStructureFees.getState().hydrate();
  }, []);

  const entries = Object.entries(fees);
  if (entries.length === 0) return null;
  return (
    <section aria-labelledby="structure-fees-title" className="space-y-2">
      <h3 id="structure-fees-title" className="font-semibold">
        {t('market.structureFee.settingsTitle')}
      </h3>
      <p className="text-text-dim">{t('market.structureFee.settingsHelp')}</p>
      <ul className="divide-y divide-line">
        {entries.map(([id, pct]) => {
          const name = `${t('market.unknownStructure')} #${id}`;
          return (
            <li key={id} className="flex items-center justify-between gap-3 py-1.5">
              <span>{t('market.structureFee.settingsRow', { name, pct })}</span>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t('market.structureFee.remove', { name })}
                onClick={() => void setFees(withoutStructureFee(fees, Number(id)))}
              >
                {t('market.structureFee.removeButton')}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
