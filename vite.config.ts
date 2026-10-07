import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages のプロジェクトサイトに置く場合は、リポジトリ名に合わせる。
// 例: https://<user>.github.io/routine/ なら '/routine/'
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-180.png'],
      manifest: {
        name: 'Routine',
        short_name: 'Routine',
        description: '最低ラインで続ける習慣記録',
        start_url: base,
        scope: base,
        // standalone にしないと Safari の UI が残り、アプリらしくならない。
        display: 'standalone',
        background_color: '#faf9f7',
        theme_color: '#3a7d6b',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // 完全オフラインで動かす。通信は一切しないアプリなので、
        // 全アセットをプリキャッシュしてしまうのが単純で確実。
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
      },
    }),
  ],
});
