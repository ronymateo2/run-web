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
			injectRegister: false,
			includeAssets: ["favicon.ico", "favicon.svg", "apple-touch-icon.png"],
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
				skipWaiting: true,
				clientsClaim: true,
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
	define: {
		__BUILD__: JSON.stringify(
			process.env.GITHUB_SHA
				? process.env.GITHUB_SHA.slice(0, 7)
				: new Date().toISOString(),
		),
	},
	build: {
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (id.includes("node_modules")) {
						if (
							id.includes("react") ||
							id.includes("react-dom") ||
							id.includes("react-router-dom") ||
							id.includes("@react-oauth/google")
						) {
							return "vendor-react";
						}
						if (							
							id.includes("drizzle-orm")
						) {
							return "vendor-data";
						}
						if (
							id.includes("motion") ||
							id.includes("@phosphor-icons")
						) {
							return "vendor-ui";
						}
						if (
							id.includes("react-markdown") ||
							id.includes("remark-")
						) {
							return "vendor-markdown";
						}
						if (
							id.includes("@sqlite.org/sqlite-wasm") ||
							id.includes("comlink")
						) {
							return "vendor-sqlite";
						}
						return "vendor";
					}
				},
			},
		},
	},
	optimizeDeps: {
		exclude: ["@sqlite.org/sqlite-wasm"],
	},
	server: {
		headers: {
			// Allow Google OAuth popup to postMessage back to opener.
			// SQLite SAHPool does not require cross-origin isolation.
			"Cross-Origin-Opener-Policy": "unsafe-none",
		},
	},
});
