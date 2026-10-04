/**
 * The Trip Plan summary's hold meters: one fill bar per hold of the Cargo
 * Space, so a hauler sees which hold is full and which still has room. A
 * single hold keeps the plain "used of total m³" meter; several each carry
 * their name. A hold no candidate fits stays empty rather than reading as
 * spare room for the load.
 */
import { useTranslation } from 'react-i18next';
import type { HoldUse } from '@/engine/market/haulingPlan';

const fmt = (m3: number) => Math.round(m3).toLocaleString();
const pct = (hold: HoldUse) => Math.min(100, (hold.usedM3 / hold.capacityM3) * 100);

export function HaulingHoldMeters({
  holds,
  bindingText,
}: {
  holds: readonly HoldUse[];
  bindingText: string | null;
}) {
  const { t } = useTranslation();
  const binding = bindingText && <span className="@max-[40rem]:hidden"> · {bindingText}</span>;

  if (holds.length === 1) {
    const hold = holds[0]!;
    const counts = { used: fmt(hold.usedM3), total: fmt(hold.capacityM3) };
    return (
      <>
        <div
          role="img"
          aria-label={t('market.hauling.plan.holdAria', counts)}
          className="h-1 min-w-8 flex-1 bg-line @max-[26rem]:hidden @min-[40rem]:max-w-xs"
        >
          <div className="h-full bg-accent" style={{ width: `${pct(hold)}%` }} />
        </div>
        {/* The meter's bar goes first in a phone-narrow bar (the words beside
            it say the same), so the ship button keeps its name. What binds the
            load prints in a bar 40rem wide and up (the bar's own width, not the
            viewport's: a tablet with the rail open is as cramped as a phone);
            below that there is no room, and each row's detail says what capped
            that row. */}
        <span className="min-w-0 shrink-0 text-[0.6875rem] text-text-dim">
          {t('market.hauling.plan.holdUsed', counts)}
          {binding}
        </span>
      </>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <ul className="flex min-w-0 flex-wrap gap-x-4 gap-y-1">
        {holds.map((hold) => {
          const counts = {
            name: t(`market.hauling.holds.${hold.kind}`),
            used: fmt(hold.usedM3),
            total: fmt(hold.capacityM3),
          };
          return (
            <li key={hold.kind} className="flex min-w-0 items-center gap-2">
              <div
                role="img"
                aria-label={t('market.hauling.plan.holdNamedAria', counts)}
                className="h-1 w-12 shrink-0 bg-line @max-[26rem]:hidden"
              >
                <div className="h-full bg-accent" style={{ width: `${pct(hold)}%` }} />
              </div>
              <span className="min-w-0 truncate text-[0.6875rem] text-text-dim">
                {t('market.hauling.plan.holdNamed', counts)}
              </span>
            </li>
          );
        })}
      </ul>
      {bindingText && (
        <span className="text-[0.6875rem] text-text-dim @max-[40rem]:hidden">{bindingText}</span>
      )}
    </div>
  );
}
