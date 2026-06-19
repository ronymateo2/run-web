import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { setRegistration } from "./pwa";

// autoUpdate: cuando hay SW nuevo, skipWaiting + recarga sola.
// El chequeo periódico (cada 60s) se quitó por batería: hacía fetch de sw.js
// cada minuto para siempre, incluso con el tab oculto. Ahora el SW revisa en
// cold launch y el usuario puede forzar un chequeo desde Perfil (checkForUpdate).
registerSW({
	immediate: true,
	onRegisteredSW(_url, reg) {
		if (reg) setRegistration(reg);
	},
});

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
