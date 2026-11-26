import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InfoTooltip, Spinner, TextInput } from '@/components/ui';
import { resolveSolarSystem, type SolarSystemRef } from '@/features/character/systemLookup';

interface BuildSystemInputProps {
  systemName: string | undefined;
  hubSystemName: string;
  securityLabel: string;
  onChange: (system: SolarSystemRef | null) => void;
  idPrefix?: string;
}

export function BuildSystemInput({
  systemName,
  hubSystemName,
  securityLabel,
  onChange,
  idPrefix = 'build-plan-system',
}: BuildSystemInputProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(systemName ?? '');
  const [status, setStatus] = useState<'idle' | 'resolving' | 'notFound' | 'unavailable'>('idle');
  const errorId = `${idPrefix}-error`;
  const hasError = status === 'notFound' || status === 'unavailable';

  const [prevSystemName, setPrevSystemName] = useState(systemName);
  if (prevSystemName !== systemName) {
    setPrevSystemName(systemName);
    setText(systemName ?? '');
    setStatus('idle');
  }

  async function commit() {
    const trimmed = text.trim();
    if (trimmed === (systemName ?? '')) return setStatus('idle');
    if (trimmed === '') {
      setStatus('idle');
      onChange(null);
      return;
    }
    setStatus('resolving');
    const result = await resolveSolarSystem(trimmed);
    if (result.status !== 'found') return setStatus(result.status);
    setStatus('idle');
    setText(result.system.name);
    onChange(result.system);
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="flex items-center gap-1">
        <label htmlFor={idPrefix}>{t('industry.buildSystem')}</label>
        <InfoTooltip
          label={t('industry.buildSystemTooltipLabel')}
          content={t('industry.buildSystemTooltip')}
        />
      </span>
      <span className="flex items-center gap-1">
        <TextInput
          id={idPrefix}
          className="w-full"
          value={text}
          placeholder={hubSystemName}
          aria-invalid={status === 'notFound'}
          aria-describedby={hasError ? errorId : undefined}
          onChange={(e) => {
            setText(e.target.value);
            if (hasError) setStatus('idle');
          }}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commit();
            }
          }}
        />
        {status === 'resolving' && <Spinner size="sm" />}
      </span>
      {status === 'notFound' ? (
        <span id={errorId} role="alert" className="text-danger">
          {t('industry.buildSystemNotFound')}
        </span>
      ) : status === 'unavailable' ? (
        <span id={errorId} role="alert" className="text-warning">
          {t('industry.buildSystemUnavailable')}
        </span>
      ) : (
        <span className="text-text-dim">{securityLabel}</span>
      )}
    </div>
  );
}
