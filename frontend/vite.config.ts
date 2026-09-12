import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png"],
      manifest: {
        name: "Sistema de Gestión Biométrica",
        short_name: "Biometría",
        description: "Plataforma de asistencia, biometría y operaciones TI",
        theme_color: "#dc2626",
        background_color: "#fff7f7",
        display: "standalone",
        start_url: "/",
        scope: "/",
        lang: "es",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
    }),
  ],
  server: {
    port: 3015,
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:8015", changeOrigin: true } },
  },
});