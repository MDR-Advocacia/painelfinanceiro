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
  sede: string | null; sede_id: string | null;
  soma_percentual: number; alocacoes: EfAlocacao[];
}
export interface EfSedeRateio {
  id?: string; sede: string; sede_id: string; percentual?: number;
}
export interface EfPorSede {
  id: string; nome: string; receita: number;
  custo_operacional: number; custo_infra: number; custo_total: number;
  margem: number; linhas: number; equipes: number;
}
export interface EfCentro {
  id: string; nome: string; tipo: "faturamento" | "infraestrutura";
  linhas: EfLinha[]; alocacoes: EfAlocacao[]; sedes: EfSedeRateio[];
  receita_total: number; custo_total: number;
}
export interface EfEquipe {
  id: string; nome?: string; equipe?: string; slug: string; grupo: string;
  centro_custo: string | null; centro_custo_id?: string | null;
  alocada_em?: string[];
  colaboradores?: number;
}
export interface EfCentroDetalhe {
  id: string; nome: string; tipo: string;
  periodo: string | null; meses: string[];
  series: { mes: string; total: number; por_linha: Record<string, number> }[];
  linhas: {
    id: string; nome: string; area: string; ativo: boolean;
    receita_ultimo: number; receita_acumulada: number; soma_percentual: number;
    alocacoes: { id: string; equipe_id: string; equipe: string; percentual: number;
                 custo_total: number | null; a_pagar: number | null; pessoas: number | null }[];
  }[];
  equipes: { id: string; nome: string; grupo: string; pessoas: number; custo_total: number;
             linhas: { linha: string; percentual: number }[] }[];
  receita_ultimo: number; receita_acumulada: number;
  custo_total: number; a_pagar: number; margem: number;
  competencia_custo: string | null; custo_parcial: boolean;
}
export interface EfEquipeDetalhe {
  id: string; nome: string; slug: string; grupo: string; centro_custo: string | null;
  pessoas: {
    id: string; matricula: number; nome: string; cargo: string | null;
    regime: string; status: string; supervisor: string | null;
    salario_bruto: number; custo_total: number | null; a_pagar: number | null;
    ferias_dias: number; em_rescisao: boolean;
  }[];
  resumo_cargos: { cargo: string; n: number; custo: number }[];
  alocacoes: { id: string; tipo: "linha" | "centro"; centro: string; centro_id: string;
               destino: string; area: string | null; percentual: number;
               receita_participacao: number }[];
  totais: { ativos: number; custo_total: number; a_pagar: number; receita_participacao: number };
  competencia_custo: string | null; custo_parcial: boolean;
}
export interface EfEstrutura {
  periodo: string | null;
  periodos?: string[];
  competencia_custo: string | null;
  custo_parcial: boolean;
  centros: EfCentro[];
  infraestrutura: EfCentro[];
  por_sede: EfPorSede[];
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
  centroDetalhe: (id: string) =>
    fetch(`${API_URL}/estrutura/centros/${id}/detalhe/`, { headers: authHeaders() })
      .then((r) => j<EfCentroDetalhe>(r)),

  sedeDetalhe: (id: string) =>
    fetch(`${API_URL}/estrutura/sedes/${id}/detalhe/`, { headers: authHeaders() })
      .then((r) => j<EfSedeDetalhe>(r)),

  equipeDetalhe: (id: string) =>
    fetch(`${API_URL}/estrutura/equipes/${id}/detalhe/`, { headers: authHeaders() })
      .then((r) => j<EfEquipeDetalhe>(r)),

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
  sedes: () =>
    fetch(`${API_URL}/estrutura/sedes/`, { headers: authHeaders() })
      .then((r) => j<{ id: string; nome: string }[]>(r)),

  definirSedeLinha: (linhaId: string, sede_id: string | null) =>
    fetch(`${API_URL}/estrutura/linhas/${linhaId}/sede/`, {
      method: "PATCH", headers: H(), body: JSON.stringify({ sede_id }),
    }).then((r) => j<{ sede: string | null }>(r)),

  definirRateioSedes: (centroId: string, rateio: { sede_id: string; percentual: number }[]) =>
    fetch(`${API_URL}/estrutura/centros/${centroId}/rateio-sedes/`, {
      method: "PATCH", headers: H(), body: JSON.stringify({ rateio }),
    }).then((r) => j<{ ok: boolean }>(r)),

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

export interface EfSedeDetalhe {
  id: string;
  nome: string;
  periodo: string | null;
  meses: string[];
  series: { mes: string; total: number }[];
  centros: {
    id: string; nome: string; receita: number;
    linhas: {
      id: string; nome: string; area: string;
      receita: number; receita_acumulada: number;
      alocacoes: { id: string; equipe_id: string; equipe: string; percentual: number; custo_total: number }[];
    }[];
  }[];
  equipes: { id: string; nome: string; grupo: string; custo_total: number; pessoas?: number; linhas: string[] }[];
  infraestrutura: { id: string; nome: string; percentual: number; custo_centro: number; fatia: number }[];
  estrutura: { periodo: string | null; itens: any[]; total: number };
  totais: {
    receita: number; custo_operacional: number; a_pagar: number;
    custo_infra: number; custo_estrutura: number; custo_total: number;
    margem: number; pessoas: number; por_regime: Record<string, number>; linhas: number;
  };
  competencia_custo: string | null;
  custo_parcial: boolean;
}

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

// ── Seleção das páginas de detalhe ──
// A view do app é uma string; o id do centro/equipe aberto vive aqui (module
// state + sessionStorage pra sobreviver ao refresh da página).
let selecionado: { tipo: "centro" | "equipe" | "sede"; id: string } | null = null;
try {
  const salvo = sessionStorage.getItem("ef_selecionado");
  if (salvo) selecionado = JSON.parse(salvo);
} catch { /* primeira visita */ }

export function lerSelecionado() {
  return selecionado;
}
function selecionar(tipo: "centro" | "equipe" | "sede", id: string) {
  selecionado = { tipo, id };
  try { sessionStorage.setItem("ef_selecionado", JSON.stringify(selecionado)); } catch { /* sem storage */ }
}
/** Abre a página dedicada do centro. */
export function abrirDetalheCentro(id: string, setView: (v: any) => void) {
  selecionar("centro", id);
  setView("estrutura-centro");
}
/** Abre a página dedicada da equipe. */
export function abrirDetalheEquipe(id: string, setView: (v: any) => void) {
  selecionar("equipe", id);
  setView("estrutura-equipe");
}
/** Abre a página dedicada da sede. */
export function abrirDetalheSede(id: string, setView: (v: any) => void) {
  selecionar("sede", id);
  setView("estrutura-sede");
}
export function abrirGerenciadorEquipes() {
  window.dispatchEvent(new CustomEvent(EF_EVENTOS.equipes));
}
export function avisarEstruturaMudou() {
  window.dispatchEvent(new CustomEvent(EF_EVENTOS.mudou));
}
