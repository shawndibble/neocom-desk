import { captureMessage } from '@sentry/react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
// The build swaps this import for en.json's shell half (`localeSplitPlugin.ts`);
// dev and tests get the whole file.
import en from './locales/en.json';
import { SHARED_NOTIFICATION_WORDING } from '@/engine/notificationWording';
import { connectLazyResources } from './lazyResources';
import { createMissingKeyHandler } from './missingKeyReport';

/**
 * The one place these six events' live English wording lives, spliced in here
 * so `notifications.fired.*` no longer hand-duplicates it.
 *
 * Four of the six are also read by `src/engine/projection.ts` for Scheduled
 * Push rows, which have no i18next runtime to render from (ADR 0010). The two
 * planetary events are not: `projectionWording` hedges them on the push path
 * (a reset run done in game falsifies the prediction before it fires) and
 * `projection.ts` writes that copy inline, so only the live rendering below
 * reads them. `index.test.ts` pins both halves of that split.
 */
const translation = {
  ...en,
  notifications: {
    ...en.notifications,
    fired: {
      ...en.notifications.fired,
      ...SHARED_NOTIFICATION_WORDING,
    },
  },
};

i18n.use(initReactI18next).init({
  resources: { en: { translation } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  // Production only: the build splits en.json (`localeSplit.ts`), so a key
  // can be missing there that dev and tests, which load the whole file, never
  // miss. One Sentry message per key per session.
  saveMissing: import.meta.env.PROD,
  missingKeyHandler: createMissingKeyHandler((key) =>
    captureMessage('Missing translation key', {
      level: 'warning',
      tags: { subsystem: 'i18n' },
      fingerprint: ['missing-translation-key', key],
      extra: { key },
    })
  ),
});

// In a production build the rest of en.json arrives as each chunk that names
// it loads (`localeSplit.ts`): a deep merge that never overwrites, so a group
// only ever adds keys.
connectLazyResources((resources) =>
  i18n.addResourceBundle('en', 'translation', resources, true, false)
);

export default i18n;
