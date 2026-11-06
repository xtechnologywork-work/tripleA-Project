import type { MetadataRoute } from 'next';

// Lets the app be added to the Home Screen and opened like an app (needed for notifications on iPhone)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TripleA Car Care',
    short_name: 'TripleA',
    description: 'Car care at your parking bay, on demand.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      { src: '/pwa-icon?size=192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon?size=512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon?size=512&maskable=1', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
