import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0", // Alterado para IPv4 para melhor compatibilidade com Docker no Windows
    port: 8080,
    hmr: {
      overlay: false,
    },
    // --- ADICIONE ESTE BLOCO ABAIXO ---
    watch: {
      usePolling: true,   // Força o Vite a verificar mudanças de arquivos manualmente
      interval: 100,      // Checa a cada 100ms
    },
    // ---------------------------------
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