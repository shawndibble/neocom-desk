import { appSourceFiles, ratchet } from '@/test/sourceRatchet';

const token = (str: string, pattern: string) =>
  new RegExp(`(^|[\\s'"\`])(${pattern})([\\s'"\`]|$)`).test(str);

const scanned = appSourceFiles().filter(
  ({ path }) =>
    /^src\/(app|features|routes|components)\//.test(path) &&
    !path.startsWith('src/components/ui/') &&
    !path.split('/').includes('landing') &&
    path !== 'src/routes/Login.tsx'
);

const literals = scanned.map(({ path, source }) => ({
  file: path,
  strings: source.match(/(['"`])(?:(?!\1)[^\n])*\1/g) ?? [],
}));

const offenders = (test: (str: string) => boolean) =>
  literals.filter(({ strings }) => strings.some(test)).map(({ file }) => file);

const TONE = '(warning|danger|accent)';

ratchet(
  'a Well recipe spelled out by hand',
  offenders((str) => {
    if (!token(str, 'rounded-xs') || !token(str, 'border')) return false;
    const tinted =
      token(str, `border-${TONE}(/\\d+|-dim)?`) &&
      token(str, `bg-${TONE}/\\d+`) &&
      !/hover:|active:/.test(str);
    const neutral =
      token(str, 'border-line') &&
      token(str, 'bg-panel-2') &&
      token(str, '(p|px|py)-(2|2\\.5|3|3\\.5|4)') &&
      !/hover:|divide-|size-|\bh-|absolute|fixed|sticky|font-mono/.test(str);
    return tinted || neutral;
  }),
  [
    'src/features/assets/MovePlanResult.tsx',
    'src/features/miningTax/AutoAssignmentBar.tsx',
    'src/features/miningTax/LinkPaymentDialog.tsx',
    'src/features/notifications/AlertsWhenClosedSection.tsx',
    'src/features/notifications/DangerBanner.tsx',
    'src/features/notifications/NotificationsDelivery.tsx',
    'src/features/pi/EsiDidntAnswer.tsx',
    'src/features/pi/PricesUnavailable.tsx',
  ]
);

ratchet(
  'an uppercase label tracked looser than tracking-widest',
  offenders((str) => token(str, 'uppercase') && token(str, 'tracking-(wide|wider)')),
  [
    'src/app/NavItem.tsx',
    'src/features/miningTax/StatusPill.tsx',
    'src/features/miningTax/YieldDetailModal.tsx',
    'src/features/miningTax/corpBook/CorpStatusPill.tsx',
    'src/features/stockTargets/StockStatus.tsx',
    'src/features/travel/PilotKillActivity.tsx',
  ]
);

ratchet(
  'eyebrowClassName retyped by hand',
  offenders((str) =>
    [
      'text-\\[0\\.6875rem\\]',
      'font-semibold',
      'tracking-widest',
      'text-text-dim',
      'uppercase',
    ].every((pattern) => token(str, pattern))
  ),
  [
    'src/features/industry/BlueprintAcquisitionModal.tsx',
    'src/features/market/CompareAttributesMatrix.tsx',
    'src/features/notifications/ChannelColumns.tsx',
    'src/features/pi/DirectiveRow.tsx',
    'src/features/skills/compare/SkillCompareView.tsx',
  ]
);

ratchet(
  'a text size off the type scale',
  offenders((str) =>
    token(
      str,
      '([a-z@\\[\\]0-9/-]+:)?(text-(lg|2xl|4xl|5xl|6xl|7xl|8xl)|text-\\[(?!0\\.6875rem)[0-9.]+(rem|px)\\])'
    )
  ),
  [
    'src/features/fittings/AlphaCloneChip.tsx',
    'src/features/pi/colonies/TodayPanel.tsx',
    'src/features/share/ShareShell.tsx',
  ]
);

ratchet(
  'a label hand-stacked over its control instead of Fields variant="stacked"',
  scanned
    .filter(({ source }) =>
      /<label\b[^>]*(block space-y-1|flex flex-col gap-1|grid gap-1)/.test(source)
    )
    .map(({ path }) => path),
  [
    'src/features/corp/moons/addCorps/ConfirmBatchDialog.tsx',
    'src/features/corp/srp/MemberClaimDialogs.tsx',
    'src/features/corp/vetting/ApplyPage.tsx',
    'src/features/fittings/DamageProfilePicker.tsx',
    'src/features/fittings/ImproveSettingsPanel.tsx',
    'src/features/fittings/TargetProfilePicker.tsx',
    'src/features/industry/BlueprintAcquisitionModal.tsx',
    'src/features/industry/PlanBuildLocationFields.tsx',
    'src/features/industry/PlanReactionFields.tsx',
    'src/features/industry/PlanRigFitField.tsx',
    'src/features/industry/ProductionRunsPanel.tsx',
    'src/features/industry/RetargetGroupDialog.tsx',
    'src/features/industry/RigMatchHelper.tsx',
    'src/features/industry/RunLossModals.tsx',
    'src/features/industry/SaleLinkingControls.tsx',
    'src/features/market/PriceAlertForm.tsx',
    'src/features/market/StructureFeeLine.tsx',
    'src/features/overview/widgets/TrendPicks.tsx',
    'src/features/overview/widgets/WidgetMenu.tsx',
    'src/features/skills/planner/RemapMarkerModal.tsx',
    'src/features/survey/SurveyTemplateDialogs.tsx',
  ]
);
