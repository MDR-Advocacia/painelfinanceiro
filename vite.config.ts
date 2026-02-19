import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    allowedHosts: [
      "painelfinanceiro.mdradvocacia.com",
      "jcokc0c4gc4swgsgkgcsgo44.3.21.60.254.sslip.io"
    ],
    hmr: {
      overlay: false,
    },
    watch: {
      usePolling: true,
      interval: 100,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));