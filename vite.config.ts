import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const API_TARGET = process.env.API_TARGET ?? "http://127.0.0.1:8787";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      // In development the frontend proxies /api to the local Worker
      // (`npm run dev` in worker/) so the app runs same-origin, cookies and all.
      "/api": { target: API_TARGET, changeOrigin: true, ws: true },
    },
  },
  build: {
    sourcemap: mode !== "production",
    chunkSizeWarningLimit: 900,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
