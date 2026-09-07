import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import { SHARED_NOTIFICATION_WORDING } from '@/engine/notificationWording';

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
});

export default i18n;
