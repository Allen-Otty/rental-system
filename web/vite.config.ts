/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Makao",
        short_name: "Makao",
        description: "Rent, buy land and book home services across Kenya",
        theme_color: "#0A0C10",
        background_color: "#0A0C10",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      workbox: {
        // Cache the app shell and photos for offline; never cache API calls (rent data must be fresh).
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [{ urlPattern: ({ request }) => request.destination === "image", handler: "StaleWhileRevalidate", options: { cacheName: "makao-images", expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 14 } } }],
      },
    }),
  ],
  server: { port: 3000, proxy: { "/api": "http://localhost:8000" } },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/test-setup.ts"], css: false },
});
