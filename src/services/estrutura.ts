// Estrutura de Faturamento — clientes (centros), linhas e alocações de equipe.
import { useSyncExternalStore } from "react";

import { API_URL, authHeaders } from "@/hooks/useAuth";

export interface EfAlocacao {
  id: string; equipe_id: string; equipe: string; slug: string; grupo: string;
  percentual: number; centro_custo: string | null;
  custo_total: number | null; a_pagar: number | null; pessoas: number | null;
}
export interface EfImpostos {
  lucro_presumido: number; irpj: number; irpj_adicional: number; csll: number;
  pis: number; cofins: number; iss: number; total: number;
}
export interface EfLinha {
  id: string; nome: string; area: "passivo" | "credito" | "especializada";
  ativo: boolean;
  receita_bruta: number; descontos: number; receita_liquida: number;
  impostos: number; impostos_detalhe: EfImpostos;
  sede: string | null; sede_id: string | null;
  soma_percentual: number; alocacoes: EfAlocacao[];
}
export interface EfSedeRateio {
  id?: string; sede: string; sede_id: string; percentual?: number;
}
export interface EfPorSede {
  id: string; nome: string; receita: number; impostos: number;
  custo_operacional: number; custo_infra: number; custo_total: number;
  margem: number; linhas: number; equipes: number;
}
export interface EfCentro {
  id: string; nome: string; tipo: "faturamento" | "infraestrutura";
  linhas: EfLinha[]; alocacoes: EfAlocacao[]; sedes: EfSedeRateio[];
  /** receita LÍQUIDA (bruta − descontos) — é o que a margem usa */
  receita_total: number;
  receita_bruta_total: number; descontos_total: number; impostos_total: number;
  custo_total: number;
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

  faturamentoLinha: (linhaId: string, periodo: string) =>
    fetch(`${API_URL}/estrutura/linhas/${linhaId}/faturamento/?periodo=${periodo}`,
          { headers: authHeaders() })
      .then((r) => j<EfFaturamentoLinha>(r)),

  lancarFaturamento: (linhaId: string, periodo: string, dados: Record<string, number | string>) =>
    fetch(`${API_URL}/estrutura/linhas/${linhaId}/faturamento/`, {
      method: "PATCH", headers: H(), body: JSON.stringify({ periodo, ...dados }),
    }).then((r) => j<{ periodo: string; faturamento: Record<string, number | string> }>(r)),

  informeFaturamento: (centroId: string, periodo: string) =>
    fetch(`${API_URL}/estrutura/centros/${centroId}/faturamento/?periodo=${periodo}`,
          { headers: authHeaders() })
      .then((r) => j<{ centro: string; periodo: string; meses_lancados: string[]; linhas: EfInformeLinha[] }>(r)),

  lancarInforme: (centroId: string, periodo: string,
                  lancamentos: { linha_id: string; bruto: number; descontos: number }[]) =>
    fetch(`${API_URL}/estrutura/centros/${centroId}/faturamento/`, {
      method: "PATCH", headers: H(), body: JSON.stringify({ periodo, lancamentos }),
    }).then((r) => j<{ periodo: string; alteradas: number; espelhado_em: string[] }>(r)),

  documentosDaLinha: (linhaId: string, periodo: string) =>
    fetch(`${API_URL}/estrutura/linhas/${linhaId}/documentos/?periodo=${periodo}`,
          { headers: authHeaders() })
      .then((r) => j<EfDocumentoFaturamento[]>(r)),

  /** Quantos anexos cada linha do centro tem no mês (pro badge da tabela). */
  documentosDoCentro: async (centroId: string, periodo: string) => {
    const info = await fetch(`${API_URL}/estrutura/centros/${centroId}/faturamento/?periodo=${periodo}`,
                             { headers: authHeaders() })
      .then((r) => j<{ linhas: EfInformeLinha[] }>(r));
    const pares = await Promise.all(info.linhas.map(async (l) => {
      const ds = await fetch(`${API_URL}/estrutura/linhas/${l.linha_id}/documentos/?periodo=${periodo}`,
                             { headers: authHeaders() })
        .then((r) => j<EfDocumentoFaturamento[]>(r)).catch(() => []);
      return [l.linha_id, ds.length] as const;
    }));
    return Object.fromEntries(pares) as Record<string, number>;
  },

  anexarNoFaturamento: (linhaId: string, periodo: string, arquivo: File,
                        tipo: string, descricao: string) => {
    const fd = new FormData();
    fd.append("periodo", periodo);
    fd.append("arquivo", arquivo);
    fd.append("tipo", tipo);
    if (descricao) fd.append("descricao", descricao);
    return fetch(`${API_URL}/estrutura/linhas/${linhaId}/documentos/`, {
      method: "POST", headers: authHeaders(), body: fd,
    }).then((r) => j<EfDocumentoFaturamento>(r));
  },

  baixarDocumento: async (doc: EfDocumentoFaturamento) => {
    const r = await fetch(`${API_URL}/estrutura/faturamento-documentos/${doc.id}/`,
                          { headers: authHeaders() });
    if (!r.ok) throw new Error(`Não consegui baixar (erro ${r.status}).`);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = doc.nome;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  },

  removerDocumento: async (id: string) => {
    const r = await fetch(`${API_URL}/estrutura/faturamento-documentos/${id}/`,
                          { method: "DELETE", headers: authHeaders() });
    if (!r.ok && r.status !== 204) throw new Error(`Erro ${r.status}`);
  },

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

export interface EfFaturamentoLinha {
  linha: string;
  centro: string;
  periodo: string;
  faturamento: Record<string, number | string>;
  meses_lancados: string[];
}

export interface EfInformeLinha {
  linha_id: string; linha: string; area: string; ativo: boolean; sede: string | null;
  bruto: number; descontos: number;
  aliquotaLucroPresumido: number; aliquotaISS: number;
  modoISS: string; profissionaisISS: number; lancado: boolean;
}
export interface EfDocumentoFaturamento {
  id: string; linha_id: string; periodo: string;
  tipo: string; tipo_label: string; nome: string; tamanho: number;
  descricao: string; enviado_por: string; enviado_em: string;
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
// A view do app é uma string; o id do centro/equipe/sede aberto vive aqui
// (module state + sessionStorage pra sobreviver ao refresh da página).
//
// Isso PRECISA ser observável. Trocar de centro estando já na página de um
// centro mantém a view igual ("estrutura-centro"), então o setView não gera
// re-render e a página continuaria mostrando o centro anterior — parecia que
// o menu tinha travado. Com o store abaixo, quem lê a seleção re-renderiza
// mesmo quando a view não muda.
let selecionado: { tipo: "centro" | "equipe" | "sede"; id: string } | null = null;
try {
  const salvo = sessionStorage.getItem("ef_selecionado");
  if (salvo) selecionado = JSON.parse(salvo);
} catch { /* primeira visita */ }

const ouvintesSelecao = new Set<() => void>();

export function lerSelecionado() {
  return selecionado;
}
function selecionar(tipo: "centro" | "equipe" | "sede", id: string) {
  if (selecionado?.tipo === tipo && selecionado?.id === id) return;
  selecionado = { tipo, id };
  try { sessionStorage.setItem("ef_selecionado", JSON.stringify(selecionado)); } catch { /* sem storage */ }
  ouvintesSelecao.forEach((fn) => fn());
}

function assinarSelecao(fn: () => void) {
  ouvintesSelecao.add(fn);
  return () => { ouvintesSelecao.delete(fn); };
}

/** Id do item aberto, reativo — re-renderiza a página ao trocar de item. */
export function useSelecionadoId(): string | null {
  return useSyncExternalStore(assinarSelecao, () => selecionado?.id ?? null);
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
