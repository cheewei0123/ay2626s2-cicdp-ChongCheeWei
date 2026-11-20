import type { VitePWAOptions } from 'vite-plugin-pwa';

// Makes SplitLah installable (Add to Home Screen) and able to open without the network.
// Only the app shell (HTML, JS, CSS, icons) is cached; /api is never cached, so money data
// always comes fresh from the server.
export const pwaOptions: Partial<VitePWAOptions> = {
  // A new deploy builds a new service worker; it takes over by itself and the page reloads,
  // so reopening the app shows the new version without the user doing anything
  registerType: 'autoUpdate',
  includeAssets: ['favicon.svg', 'icons/apple-touch-icon-180x180.png'],
  manifest: {
    name: 'SplitLah: split bills, track spending',
    short_name: 'SplitLah',
    description: 'Split restaurant bills by item and track your spending.',
    start_url: '/',
    scope: '/',
    display: 'standalone', // opens full-screen, without the browser's address bar
    background_color: '#080b18',
    theme_color: '#080b18',
    icons: [
      { src: '/icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/maskable-icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable', // full-bleed version that Android crops to its own icon shape
      },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
    // Opening /bills/abc offline serves the cached app, but never for /api: those
    // requests must reach the server
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/api\//],
    cleanupOutdatedCaches: true,
    // No runtimeCaching: anything not in the build (all /api calls) goes to the network
  },
};
