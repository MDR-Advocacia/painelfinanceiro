// Estrutura de Faturamento — clientes (centros), linhas e alocações de equipe.
import { API_URL, authHeaders } from "@/hooks/useAuth";

export interface EfAlocacao {
  id: string; equipe_id: string; equipe: string; slug: string; grupo: string;
  percentual: number; centro_custo: string | null;
  custo_total: number | null; a_pagar: number | null; pessoas: number | null;
}
export interface EfLinha {
  id: string; nome: string; area: "passivo" | "credito" | "especializada";
  ativo: boolean; setor_legado: string | null; receita_bruta: number;
  soma_percentual: number; alocacoes: EfAlocacao[];
}
export interface EfCentro {
  id: string; nome: string; tipo: "faturamento" | "infraestrutura";
  linhas: EfLinha[]; alocacoes: EfAlocacao[];
  receita_total: number; custo_total: number;
}
export interface EfEquipe {
  id: string; nome?: string; equipe?: string; slug: string; grupo: string;
  centro_custo: string | null;
}
export interface EfEstrutura {
  periodo: string | null;
  competencia_custo: string | null;
  custo_parcial: boolean;
  centros: EfCentro[];
  infraestrutura: EfCentro[];
  sem_alocacao: EfEquipe[];
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const d = await res.json().catch(() => ({} as any));
    throw new Error((d as any).detail || `Erro ${res.status}`);
  }
  return res.json();
}
const H = () => ({ "Content-Type": "application/json", ...authHeaders() });

export const estruturaApi = {
  carregar: (periodo?: string) =>
    fetch(`${API_URL}/estrutura/${periodo ? `?periodo=${periodo}` : ""}`, { headers: authHeaders() })
      .then((r) => j<EfEstrutura>(r)),

  equipes: () =>
    fetch(`${API_URL}/estrutura/equipes/`, { headers: authHeaders() }).then((r) => j<EfEquipe[]>(r)),

  editarPercentual: (alocacaoId: string, percentual: number) =>
    fetch(`${API_URL}/estrutura/alocacoes/${alocacaoId}/`, {
      method: "PATCH", headers: H(), body: JSON.stringify({ percentual }),
    }).then((r) => j<{ percentual: number }>(r)),

  igualar: (linhaId: string) =>
    fetch(`${API_URL}/estrutura/linhas/${linhaId}/igualar/`, { method: "POST", headers: H() })
      .then((r) => j<{ percentual: number }>(r)),

  alocar: (destino: { linha_id?: string; centro_id?: string }, equipe_id: string) =>
    fetch(`${API_URL}/estrutura/alocacoes/`, {
      method: "POST", headers: H(), body: JSON.stringify({ ...destino, equipe_id }),
    }).then((r) => j<{ ok: boolean }>(r)),

  remover: async (alocacaoId: string) => {
    const r = await fetch(`${API_URL}/estrutura/alocacoes/${alocacaoId}/remover/`, {
      method: "DELETE", headers: authHeaders(),
    });
    if (!r.ok && r.status !== 204) throw new Error(`Erro ${r.status}`);
  },
};
