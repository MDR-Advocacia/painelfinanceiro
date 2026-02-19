-- Tabela para armazenar a base de referência (Ativos + Baixados)
CREATE TABLE IF NOT EXISTS base_referencia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    npj_original TEXT NOT NULL,
    npj_limpo TEXT NOT NULL UNIQUE, -- Removido caracteres não numéricos
    polo TEXT NOT NULL,             -- AUTOR ou RÉU
    situacao TEXT,                  -- OPCIONAL: ATIVO/BAIXADO
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para cruzamento instantâneo com faturas gigantes
CREATE INDEX idx_base_npj_limpo ON base_referencia (npj_limpo);