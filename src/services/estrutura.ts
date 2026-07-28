// Estrutura de Faturamento — clientes (centros), linhas e alocações de equipe.
import { API_URL, authHeaders } from "@/hooks/useAuth";

export interface EfAlocacao {
  id: string; equipe_id: string; equipe: string; slug: string; grupo: string;
  percentual: number; centro_custo: string | null;
  custo_total: number | null; a_pagar: number | null; pessoas: number | null;
}
export interface EfLinha {
  id: string; nome: string; area: "passivo" | "credito" | "especializada";
  ativo: boolean; receita_bruta: number;
  soma_percentual: number; alocacoes: EfAlocacao[];
}
export interface EfCentro {
  id: string; nome: string; tipo: "faturamento" | "infraestrutura";
  linhas: EfLinha[]; alocacoes: EfAlocacao[];
  receita_total: number; custo_total: number;
}
export interface EfEquipe {
  id: string; nome?: string; equipe?: string; slug: string; grupo: string;
  centro_custo: string | null; centro_custo_id?: string | null;
  alocada_em?: string[];
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

  // ── CRUD: tudo tabelado e editável ──
  criarCentro: (nome: string, tipo: "faturamento" | "infraestrutura") =>
    fetch(`${API_URL}/estrutura/centros/`, { method: "POST", headers: H(), body: JSON.stringify({ nome, tipo }) })
      .then((r) => j<{ id: string }>(r)),
  renomearCentro: (id: string, nome: string) =>
    fetch(`${API_URL}/estrutura/centros/${id}/`, { method: "PATCH", headers: H(), body: JSON.stringify({ nome }) })
      .then((r) => j<{ ok: boolean }>(r)),
  excluirCentro: async (id: string) => {
    const r = await fetch(`${API_URL}/estrutura/centros/${id}/`, { method: "DELETE", headers: authHeaders() });
    if (!r.ok && r.status !== 204) {
      const d = await r.json().catch(() => ({} as any));
      throw new Error((d as any).detail || `Erro ${r.status}`);
    }
  },

  criarLinha: (centro_id: string, nome: string, area: string) =>
    fetch(`${API_URL}/estrutura/linhas/`, { method: "POST", headers: H(), body: JSON.stringify({ centro_id, nome, area }) })
      .then((r) => j<{ id: string }>(r)),
  editarLinha: (id: string, dados: { nome?: string; area?: string }) =>
    fetch(`${API_URL}/estrutura/linhas/${id}/`, { method: "PATCH", headers: H(), body: JSON.stringify(dados) })
      .then((r) => j<{ ok: boolean }>(r)),
  excluirLinha: async (id: string) => {
    const r = await fetch(`${API_URL}/estrutura/linhas/${id}/`, { method: "DELETE", headers: authHeaders() });
    if (!r.ok && r.status !== 204) {
      const d = await r.json().catch(() => ({} as any));
      throw new Error((d as any).detail || `Erro ${r.status}`);
    }
  },

  criarEquipe: (dados: { nome: string; grupo: string; centro_custo_id?: string | null }) =>
    fetch(`${API_URL}/estrutura/equipes/crud/`, { method: "POST", headers: H(), body: JSON.stringify(dados) })
      .then((r) => j<{ id: string }>(r)),
  editarEquipe: (id: string, dados: { nome?: string; grupo?: string; centro_custo_id?: string | null }) =>
    fetch(`${API_URL}/estrutura/equipes/crud/${id}/`, { method: "PATCH", headers: H(), body: JSON.stringify(dados) })
      .then((r) => j<{ ok: boolean }>(r)),
  excluirEquipe: async (id: string) => {
    const r = await fetch(`${API_URL}/estrutura/equipes/crud/${id}/`, { method: "DELETE", headers: authHeaders() });
    if (!r.ok && r.status !== 204) {
      const d = await r.json().catch(() => ({} as any));
      throw new Error((d as any).detail || `Erro ${r.status}`);
    }
  },
};

// ── Comunicação leve entre Sidebar e a tela (sem mexer no AppContext) ──
// A sidebar navega e FOCA um centro; a tela avisa quando a estrutura mudou
// (pra sidebar re-listar os centros).
export const EF_EVENTOS = {
  foco: "ef-foco",          // detail: { centroId } — rolar até o centro
  equipes: "ef-equipes",    // abrir o gerenciador de equipes
  mudou: "ef-mudou",        // estrutura alterada — re-buscar listas
};

export function focarCentro(centroId: string) {
  window.dispatchEvent(new CustomEvent(EF_EVENTOS.foco, { detail: { centroId } }));
}
export function abrirGerenciadorEquipes() {
  window.dispatchEvent(new CustomEvent(EF_EVENTOS.equipes));
}
export function avisarEstruturaMudou() {
  window.dispatchEvent(new CustomEvent(EF_EVENTOS.mudou));
}
