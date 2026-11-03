import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { SolarSystemPicker } from '@/features/route/SolarSystemPicker';
import { useSystemName } from '@/features/route/useSolarSystems';

export interface DefaultSystemsFieldProps {
  systemIds: readonly number[];
  onChange: (systemIds: number[]) => void;
}

function DefaultSystemRow({ systemId, onRemove }: { systemId: number; onRemove: () => void }) {
  const { t } = useTranslation();
  const name = useSystemName(systemId) ?? `#${systemId}`;
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="min-w-0 truncate">{name}</span>
      <Button
        size="sm"
        variant="ghost"
        aria-label={t('miningTax.payees.removeDefaultSystem', { name })}
        onClick={onRemove}
      >
        {t('miningTax.payees.removeDefaultSystemAction')}
      </Button>
    </li>
  );
}

/**
 * A Payee's Default Systems (GLOSSARY.md): the systems whose moon ore it collects, listed with a
 * remove action each and one picker to add another. Only edited here, in Manage Payees.
 */
export function DefaultSystemsField({ systemIds, onChange }: DefaultSystemsFieldProps) {
  const { t } = useTranslation();
  const exclude = useMemo(() => new Set(systemIds), [systemIds]);
  return (
    <div className="flex flex-col gap-2">
      {systemIds.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {systemIds.map((id) => (
            <DefaultSystemRow
              key={id}
              systemId={id}
              onRemove={() => onChange(systemIds.filter((s) => s !== id))}
            />
          ))}
        </ul>
      )}
      <SolarSystemPicker
        value={null}
        exclude={exclude}
        ariaLabel={t('miningTax.payees.addDefaultSystem')}
        triggerLabel={t('miningTax.payees.addDefaultSystem')}
        onChange={(id) => onChange([...systemIds, id])}
      />
    </div>
  );
}
