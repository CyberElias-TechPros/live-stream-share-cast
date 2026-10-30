import { createRoot } from 'react-dom/client'
import { bootAccent } from './hooks/useAccent'
import App from './App.tsx'
import './index.css'
// Registers the global `error` / `unhandledrejection` reporters.
import './services/errorService'

// Apply the persisted signature hue before first paint (no flash).
bootAccent()

createRoot(document.getElementById("root")!).render(<App />);

// The same worker handles Web Push and a small app-shell cache. Registering it
// on every visit means the offline LAN room can be reopened after the internet
// is disconnected; API responses and media are deliberately never cached.
if ("serviceWorker" in navigator && (window.isSecureContext || ["localhost", "127.0.0.1"].includes(window.location.hostname))) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/push-sw.js", { scope: "/" }).catch((error) => {
      console.warn("[offline] service worker registration failed", error);
    });
  });
}
