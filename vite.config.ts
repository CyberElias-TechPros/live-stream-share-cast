import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// The Cloudflare Worker API (see ./worker) runs on :8787 during development.
// Proxying `/api` keeps the browser on a single origin, so the app never needs
// CORS and the WebSocket upgrade works the same as in production.
const API_TARGET = process.env.VITE_API_TARGET || "http://127.0.0.1:8787";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
