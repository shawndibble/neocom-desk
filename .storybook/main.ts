import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  // addon-mcp serves `/mcp` while `storybook dev` runs — an optional extra for
  // interactive Claude sessions (see docs/DESIGN.md); never loaded by CI.
  addons: ['@storybook/addon-docs', '@storybook/addon-mcp'],
  framework: '@storybook/react-vite',
  // `/manifests/components.json` — the component catalogue agents read.
  features: { componentsManifest: true },
  // Reuses vite.config.ts (alias, Tailwind, define) so a story renders as the
  // app does. The PWA, Sentry, Pages-fallback and landing-shell plugins are build-pipeline
  // concerns of the app, not of a catalogue.
  viteFinal: (viteConfig) => {
    const appOnly =
      /^(vite-plugin-pwa|neocom-spa-fallback|neocom-landing-shell|neocom-lazy-chunks|neocom-release-file|sentry-)/;
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
