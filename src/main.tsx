import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";
import "./index.css";
import App from "./App";

// Surface unhandled promise rejections in dev only — production keeps the
// ErrorBoundary as the single surface for failures.
if (import.meta.env.DEV) {
  window.addEventListener("unhandledrejection", (event) => {
    console.error("Unhandled rejection:", event.reason);
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
