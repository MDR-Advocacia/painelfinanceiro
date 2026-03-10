import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Carrega as variáveis do .env
  const env = loadEnv(mode, process.cwd(), '');

  const protocol = env.PROTOCOL || 'http';
  const domain = env.URL_BASE || 'localhost';
  const backPort = env.BACKEND_PORT || '8080';

  let fullApiUrl = '';

  // 1. Se o Coolify mandar a variável pronta, usamos ela com o /api
  if (env.VITE_API_URL) {
    fullApiUrl = `${env.VITE_API_URL}/api`;
  } 
  // 2. Se o domínio for diferente de localhost, montamos SEM a porta
  else if (domain !== 'localhost') {
    fullApiUrl = `${protocol}://${domain}/api`;
  } 
  // 3. Se for localhost (seu ambiente local), montamos COM a porta
  else {
    fullApiUrl = `${protocol}://${domain}:${backPort}/api`;
  }

  // Injetamos a variável montada para que o código fonte (React) a receba
  process.env.VITE_API_URL = fullApiUrl;

  return {
    server: {
      host: "0.0.0.0",
      // Usa a porta do .env ou a 3123 como padrão de segurança
      port: parseInt(env.FRONTEND_PORT) || 3123,
      allowedHosts: true,
      hmr: {
        overlay: false,
      },
      watch: {
        usePolling: true,
        interval: 100,
      },
    },
    define: {
      // Isso garante que o valor montado esteja disponível em 'import.meta.env.VITE_API_URL'
      'import.meta.env.VITE_API_URL': JSON.stringify(fullApiUrl),
      
      // Usa a URL já corrigida (com ou sem porta) e só troca o final para acessar o painel do Django
      'import.meta.env.VITE_ADMIN_URL': JSON.stringify(fullApiUrl.replace('/api', '/admin/')),
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
  };
});
