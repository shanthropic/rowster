import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const CSP = {
  dev: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: favicon: http://favicon.localhost",
    "font-src 'self' data:",
    "connect-src ipc: http://ipc.localhost ws://localhost:1420 http://localhost:1420",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; "),
  prod: [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: favicon: http://favicon.localhost",
    "font-src 'self' data:",
    "connect-src ipc: http://ipc.localhost",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; "),
};

function csp(): Plugin {
  return {
    name: "rowster:inject-csp",
    transformIndexHtml() {
      const value = process.env.NODE_ENV === "production" ? CSP.prod : CSP.dev;
      return [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: value },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

export default defineConfig({
  plugins: [react(), csp()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@astryxdesign")) return "astryx";
          if (id.includes("node_modules/lucide-react")) return "icons";
          if (id.includes("node_modules/@tauri-apps")) return "tauri";
          if (id.includes("node_modules/react")) return "react";
        },
      },
    },
  },
});
