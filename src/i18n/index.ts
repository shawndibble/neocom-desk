import { captureMessage } from '@sentry/react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import { SHARED_NOTIFICATION_WORDING } from '@/engine/notificationWording';
import { connectLazyResources } from './lazyResources';
import { createMissingKeyHandler } from './missingKeyReport';

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

connectLazyResources((resources) =>
  i18n.addResourceBundle('en', 'translation', resources, true, false)
);

export default i18n;
