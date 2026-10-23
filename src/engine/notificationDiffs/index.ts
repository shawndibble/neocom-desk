/**
 * Notification Event diff functions, one pure function per event, split by
 * domain. Call sites import from `@/engine/notificationDiffs` unchanged; see
 * `skills.ts` for the shared conventions (engine-native snapshots,
 * `prev === undefined` fires nothing).
 */
export * from './skills';
export * from './industry';
export * from './pi';
export * from './mailCalendar';
export * from './contracts';
export * from './market';
export * from './eveNotifications';
export * from './corp';
export * from './kills';
