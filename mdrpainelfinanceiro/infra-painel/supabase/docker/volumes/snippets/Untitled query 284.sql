-- Tabela para armazenar os processos de referência (Ativos + Baixados)
CREATE TABLE IF NOT EXISTS base_referencia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    npj_original TEXT NOT NULL,
    -- A chave limpa é gerada automaticamente removendo hífens e caracteres não numéricos
    npj_limpo TEXT NOT NULL,
    polo TEXT NOT NULL, -- AUTOR ou RÉU
    situacao TEXT,      -- ATIVO ou BAIXADO
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para busca ultra rápida durante o cruzamento de honorários
CREATE INDEX idx_npj_limpo ON base_referencia (npj_limpo);

-- Constraint para não duplicar NPJ na base de referência
ALTER TABLE base_referencia ADD CONSTRAINT unique_npj_limpo UNIQUE (npj_limpo);