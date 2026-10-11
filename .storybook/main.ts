import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs'],
  framework: '@storybook/react-vite',
  // `/manifests/components.json` — the component catalogue agents read.
  features: { componentsManifest: true },
  // Reuses vite.config.ts (alias, Tailwind, define) so a story renders as the
  // app does. The PWA, Sentry and Pages-fallback plugins are build-pipeline
  // concerns of the app, not of a catalogue.
  viteFinal: (viteConfig) => {
    const appOnly = /^(vite-plugin-pwa|neocom-spa-fallback|sentry-)/;
    const strip = (plugins: unknown): unknown =>
      Array.isArray(plugins)
        ? plugins
            .map(strip)
            .filter(
              (p) => !(p && typeof p === 'object' && 'name' in p && appOnly.test(String(p.name)))
            )
        : plugins;
    return {
      ...viteConfig,
      plugins: strip(viteConfig.plugins) as typeof viteConfig.plugins,
      // The app pins 5173 for the EVE SSO callback; Storybook needs no such pin
      // and `npm run storybook` chooses a free port itself.
      server: { ...viteConfig.server, port: undefined, strictPort: false },
    };
  },
};

export default config;
