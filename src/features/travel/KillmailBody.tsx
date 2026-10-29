/**
 * One killmail's expanded body: the victim's fit with Open in Fittings, and for
 * a loss what it cost (`LossSummary`). Shared by Pilot Lookup's rows and the
 * Wallet's insurance-payout modal, so the two can never drift apart.
 */
import { useState } from 'react';
import { InlineError } from '@/components/ui/InlineError';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button, Spinner } from '@/components/ui';
import { encodeFittingShare } from '@/engine/fittings/fittingShare';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import type { Fitting } from '@/engine/fittings/types';
import { FittingModuleList } from '@/features/fittings/FittingModuleList';
import { fittingEditLocation } from '@/features/fittings/fittingRoutes';
import { cx } from '@/lib/cx';
import type { KillmailDetail, PilotKillmail } from '@/lib/zkillboard';
import { LossSummary } from './LossSummary';
import type { KillmailFitResult } from './pilotKillmailFit';

export type TypeLabel = (typeId: number) => string;
export type Expanded = 'loading' | KillmailFitResult;

interface KillmailBodyProps {
  entry: PilotKillmail;
  detail: KillmailDetail | null;
  read: Expanded | undefined;
  typeLabel: TypeLabel | null;
  /** The body's wrapper; the row gives it an id and a border, the modal neither. */
  className?: string;
  id?: string;
}

export function KillmailBody({ entry, detail, read, typeLabel, className, id }: KillmailBodyProps) {
  const showLossSummary = entry.side === 'loss' && detail !== null;
  return (
    <div
      id={id}
      className={cx(className, showLossSummary && 'grid gap-x-4 gap-y-2 md:grid-cols-2')}
    >
      <KillmailFit read={read} typeLabel={typeLabel} />
      {showLossSummary && (
        <div className="min-w-0 border-t border-line pt-2 md:border-t-0 md:pt-0">
          <LossSummary detail={detail} zkbValue={entry.value} />
        </div>
      )}
    </div>
  );
}

function KillmailFit({
  read,
  typeLabel,
}: {
  read: Expanded | undefined;
  typeLabel: TypeLabel | null;
}) {
  const { t } = useTranslation();
  if (read === undefined || read === 'loading' || typeLabel === null) {
    return <Spinner size="sm" delayMs={200} label={t('travel.pilot.recent.fitLoading')} />;
  }
  if (!read.ok) {
    return (
      <p role="status" className="text-xs text-warning">
        {t('travel.pilot.recent.fitFailed')}
      </p>
    );
  }
  if (read.fitting === null) {
    return <p className="text-xs text-text-dim">{t('travel.pilot.recent.noFit')}</p>;
  }
  return <FitView fitting={read.fitting} typeLabel={typeLabel} />;
}

function FitView({ fitting, typeLabel }: { fitting: Fitting; typeLabel: TypeLabel }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function openInFittings() {
    setBusy(true);
    setFailed(false);
    try {
      const encoded = await encodeFittingShare(fittingToShareInput(fitting));
      if (encoded.ok) navigate(fittingEditLocation(encoded.payload));
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const isEmpty =
    fitting.modules.length === 0 && fitting.drones.length === 0 && fitting.cargo.length === 0;
  return (
    <div className="space-y-2">
      {isEmpty ? (
        <p className="text-xs text-text-dim">{t('travel.pilot.recent.emptyFit')}</p>
      ) : (
        <FittingModuleList fitting={fitting} typeName={typeLabel} linkNames />
      )}
      <Button size="sm" disabled={busy} onClick={() => void openInFittings()}>
        {t('travel.pilot.recent.openInFittings')}
      </Button>
      {failed && <InlineError>{t('travel.pilot.recent.openFailed')}</InlineError>}
    </div>
  );
}
