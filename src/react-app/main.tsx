import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";

// autoUpdate: cuando hay SW nuevo, skipWaiting + recarga sola.
// El intervalo fuerza chequeo con la app abierta (clave en iOS,
// que si no solo revisa en cold launch).
registerSW({
	immediate: true,
	onRegisteredSW(_url, reg) {
		if (reg) setInterval(() => reg.update(), 60_000);
	},
});

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
