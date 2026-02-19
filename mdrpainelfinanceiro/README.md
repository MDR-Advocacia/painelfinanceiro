MDR - Painel Financeiro 🚀
Sistema de gestão financeira e análise de KPIs desenvolvido para a MDR Advocacia. O projeto centraliza dados de faturamento, projeções e desempenho por setores, integrando um frontend moderno com uma infraestrutura robusta via Docker e Supabase local.

📌 Funcionalidades Principais
Dashboard Executivo: Visualização em tempo real de faturamento e metas.

Gestão de Setores: Análise individualizada de performance por área jurídica.

Projeções Financeiras: Ferramentas para estimar crescimento e fluxo de caixa.

Autenticação Segura: Controle de acesso via Supabase Auth.

Infraestrutura como Código: Ambiente 100% conteinerizado para facilitar o deploy e desenvolvimento.

🛠️ Tecnologias Utilizadas
Frontend: React + TypeScript + Vite + Tailwind CSS.

UI Components: Shadcn/UI.

Backend/Banco de Dados: Supabase (PostgreSQL, GoTrue para Auth, PostgREST).

Infraestrutura: Docker & Docker Compose.

Versionamento: Git & GitHub.

📂 Estrutura do Repositório
Plaintext
mdrpainelfinanceiro/
├── infra-painel/         # Configurações do Supabase e Docker
│   └── supabase/
│       └── docker/       # Docker Compose e volumes do banco
├── src/                  # Código-fonte do Frontend (React)
├── public/               # Ativos estáticos (Favicon, Logos)
├── supabase/             # Migrations e Edge Functions
├── Dockerfile            # Configuração da imagem do Frontend
└── docker-compose.yml    # Orquestração de todos os serviços
🚀 Como Executar o Projeto
Pré-requisitos
Docker Desktop instalado e rodando.

Git instalado.

Passo a Passo
Clone o repositório:

Bash
git clone https://github.com/jonilsonvilela/mdrpainelfinanceiro.git
cd mdrpainelfinanceiro/mdrpainelfinanceiro
Configure as variáveis de ambiente:

Crie um arquivo .env na raiz do projeto baseado no .env.example.

Certifique-se de que as chaves do Supabase (ANON_KEY, SERVICE_ROLE_KEY) coincidam com as do Docker.

Suba os containers:

Bash
docker compose up -d
Acesse as interfaces:

Painel Financeiro: http://localhost:8080

Supabase Studio (Dashboard do Banco): http://localhost:8081

🔧 Desenvolvimento e Sincronização
O projeto utiliza Bind Mounts no Docker. Isso significa que qualquer alteração feita nos arquivos dentro da pasta src/ ou public/ será refletida instantaneamente no navegador através do Hot Reload, sem necessidade de reconstruir a imagem.

🛡️ Segurança e Boas Práticas
Gitignore: Pastas sensíveis como node_modules/, volumes/ (dados do banco) e arquivos .env não são enviados para o repositório global.

Isolamento: Cada serviço roda em sua própria rede isolada dentro do Docker.