import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
	plugins: [
		react(),
		cloudflare(),
		VitePWA({
			registerType: "autoUpdate",
			includeAssets: ["favicon.ico", "apple-touch-icon.png"],
			manifest: {
				name: "Rurana",
				short_name: "Rurana",
				description: "Tu rehabilitación, en tu mano",
				theme_color: "#1F3A2E",
				background_color: "#F5F2EC",
				display: "standalone",
				orientation: "portrait",
				start_url: "/today",
				icons: [
					{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
					{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
				],
			},
			workbox: {
				globPatterns: ["**/*.{js,css,html,ico,png,svg,wasm}"],
				runtimeCaching: [
					{
						urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
						handler: "CacheFirst",
						options: { cacheName: "google-fonts-cache", expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
					},
					{
						urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
						handler: "CacheFirst",
						options: { cacheName: "gstatic-fonts-cache", expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
					},
				],
			},
		}),
	],
	optimizeDeps: {
		exclude: ["@sqlite.org/sqlite-wasm"],
	},
	server: {
		headers: {
			// Allow Google OAuth popup to postMessage back to opener.
			// Cloudflare Vite plugin sets same-origin by default; override to allow popups.
			"Cross-Origin-Opener-Policy": "same-origin-allow-popups",
		},
	},
});
