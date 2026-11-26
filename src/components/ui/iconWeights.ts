export const ICON_WEIGHT = 'light' as const;

export const ALLOWED_ICON_WEIGHTS = [ICON_WEIGHT, 'fill'] as const;

export type AllowedIconWeight = (typeof ALLOWED_ICON_WEIGHTS)[number];

export const PHOSPHOR_WEIGHTS = ['thin', 'light', 'regular', 'bold', 'fill', 'duotone'] as const;
