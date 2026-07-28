// API do módulo Controle de Pessoal (DP) — F1: cadastro.
import { API_URL, authHeaders } from "@/hooks/useAuth";

export interface DpCentroCusto {
  id: string; codigo: number; nome: string; ativo: boolean; colaboradores_ativos: number;
}
export interface DpCargo {
  id: string; area: string; nome: string; salario_base: number;
  dias_mes: number; carga_horaria_mes: number; ativo: boolean;
}
export interface DpColaborador {
  id: string; matricula: number; nome: string; sexo: string; cpf: string;
  unidade: string; area: string;
  centro_custo_id: string; centro_custo_nome: string;
  supervisor: string; equipe: string;
  cargo_id: string | null; cargo_nome: string | null;
  regime: "estagiario" | "clt" | "associado" | "pj"; regime_label: string;
  status: "ativo" | "inativo";
  data_entrada: string | null; data_admissao: string | null; data_demissao: string | null;
  salario_bruto: number; saldo_livre: number; vt: number; opta_vt: boolean; va: number;
  conta_bb: string; pix: string; conta_caixa: string;
}
export interface DpEvento {
  tipo: string; data_efeito: string; payload: Record<string, unknown>;
  autor: string; created_at: string;
}
export interface DpResumo {
  ativos: number; inativos: number; por_regime: Record<string, number>;
}
export interface DpAuditItem {
  usuario: string; acao: string; entidade: string; entidade_id: string;
  antes: unknown; depois: unknown; created_at: string;
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const d = await res.json().catch(() => ({} as any));
    throw new Error((d as any).detail || `Erro ${res.status}`);
  }
  return res.json();
}
const H = () => ({ "Content-Type": "application/json", ...authHeaders() });

export const dpApi = {
  resumo: () => fetch(`${API_URL}/dp/colaboradores/resumo/`, { headers: authHeaders() }).then((r) => j<DpResumo>(r)),

  listar: (p: { busca?: string; regime?: string; status?: string; cc?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    Object.entries(p).forEach(([k, v]) => { if (v !== undefined && v !== "") qs.set(k, String(v)); });
    return fetch(`${API_URL}/dp/colaboradores/?${qs}`, { headers: authHeaders() })
      .then((r) => j<{ total: number; items: DpColaborador[] }>(r));
  },

  criar: (dados: Partial<DpColaborador>) =>
    fetch(`${API_URL}/dp/colaboradores/`, { method: "POST", headers: H(), body: JSON.stringify(dados) })
      .then((r) => j<DpColaborador>(r)),

  atualizar: (id: string, dados: Partial<DpColaborador>) =>
    fetch(`${API_URL}/dp/colaboradores/${id}/`, { method: "PATCH", headers: H(), body: JSON.stringify(dados) })
      .then((r) => j<DpColaborador>(r)),

  desligar: (id: string, data_demissao: string, observacao = "") =>
    fetch(`${API_URL}/dp/colaboradores/${id}/desligar/`, {
      method: "POST", headers: H(), body: JSON.stringify({ data_demissao, observacao }),
    }).then((r) => j<DpColaborador>(r)),

  eventos: (id: string) =>
    fetch(`${API_URL}/dp/colaboradores/${id}/eventos/`, { headers: authHeaders() }).then((r) => j<DpEvento[]>(r)),

  proximaMatricula: (regime: string) =>
    fetch(`${API_URL}/dp/colaboradores/proxima_matricula/?regime=${regime}`, { headers: authHeaders() })
      .then((r) => j<{ matricula: number }>(r)),

  ccs: () => fetch(`${API_URL}/dp/centros-custo/`, { headers: authHeaders() }).then((r) => j<DpCentroCusto[]>(r)),
  cargos: () => fetch(`${API_URL}/dp/cargos/`, { headers: authHeaders() }).then((r) => j<DpCargo[]>(r)),

  importar: (arquivo: File) => {
    const fd = new FormData();
    fd.append("arquivo", arquivo);
    return fetch(`${API_URL}/dp/importar/`, { method: "POST", headers: authHeaders(), body: fd })
      .then((r) => j<{ ccs: number; cargos: number; colaboradores_novos: number; colaboradores_atualizados: number; desligados_marcados: number; avisos: string[] }>(r));
  },

  auditoria: (limit = 50, offset = 0) =>
    fetch(`${API_URL}/dp/auditoria/?limit=${limit}&offset=${offset}`, { headers: authHeaders() })
      .then((r) => j<{ total: number; items: DpAuditItem[] }>(r)),
};

// ── F2: competências / folha ──
export interface DpCompetencia {
  id: string; ano: number; mes: number; mes_nome: string;
  dias_mes: number; dias_uteis: number;
  status: "aberta" | "em_revisao" | "fechada";
  aberta_por: string; enviada_revisao_por: string; fechada_por: string;
  fechada_em: string | null; total_itens: number;
}
export interface DpFolhaItem {
  id: string; colaborador_id: string; matricula: number; nome: string; regime: string;
  centro_custo_nome: string; salario_bruto: number;
  faltas_dias: number; faltas_horas: number; desc_faltas: number;
  desc_inss: number; desc_vt: number; vt_com_faltas: number; va_com_faltas: number;
  saldo_livre: number; premiacoes: number; acerto_contabil: number;
  total_pagar: number; custo_provisoes: number; inss_patronal: number; custo_total: number;
  memoria: Record<string, unknown>;
}
export interface DpFolhaTotais {
  total_pagar: number; provisoes: number; inss_patronal: number; custo_total: number;
}
export interface DpRateioLinha {
  centro_custo_nome: string; headcount: number; folha: number;
  provisoes: number; patronal: number; custo: number;
}

export const folhaApi = {
  competencias: () =>
    fetch(`${API_URL}/dp/competencias/`, { headers: authHeaders() }).then((r) => j<DpCompetencia[]>(r)),
  abrir: (ano: number, mes: number, dias_mes: number, dias_uteis: number) =>
    fetch(`${API_URL}/dp/competencias/`, { method: "POST", headers: H(), body: JSON.stringify({ ano, mes, dias_mes, dias_uteis }) })
      .then((r) => j<DpCompetencia>(r)),
  recalcular: (id: string) =>
    fetch(`${API_URL}/dp/competencias/${id}/recalcular/`, { method: "POST", headers: H() }).then((r) => j<{ itens: number }>(r)),
  itens: (id: string, p: { busca?: string; regime?: string; cc?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    Object.entries(p).forEach(([k, v]) => { if (v !== undefined && v !== "") qs.set(k, String(v)); });
    return fetch(`${API_URL}/dp/competencias/${id}/itens/?${qs}`, { headers: authHeaders() })
      .then((r) => j<{ total: number; items: DpFolhaItem[]; totais: DpFolhaTotais }>(r));
  },
  rateio: (id: string) =>
    fetch(`${API_URL}/dp/competencias/${id}/rateio/`, { headers: authHeaders() }).then((r) => j<DpRateioLinha[]>(r)),
  lancar: (id: string, dados: { colaborador_id: string; faltas_dias: number; faltas_horas: number; premiacoes: number; acerto_contabil: number; obs?: string }) =>
    fetch(`${API_URL}/dp/competencias/${id}/lancar/`, { method: "POST", headers: H(), body: JSON.stringify(dados) })
      .then((r) => j<DpFolhaItem>(r)),
  enviarRevisao: (id: string) =>
    fetch(`${API_URL}/dp/competencias/${id}/enviar_revisao/`, { method: "POST", headers: H() }).then((r) => j<DpCompetencia>(r)),
  aprovar: (id: string) =>
    fetch(`${API_URL}/dp/competencias/${id}/aprovar/`, { method: "POST", headers: H() }).then((r) => j<DpCompetencia>(r)),
  reabrir: (id: string, justificativa: string) =>
    fetch(`${API_URL}/dp/competencias/${id}/reabrir/`, { method: "POST", headers: H(), body: JSON.stringify({ justificativa }) })
      .then((r) => j<DpCompetencia>(r)),
};

// ── F4: dashboard + relatórios timbrados ──
export interface DpDashboard {
  headcount: number; por_regime: Record<string, number>;
  admissoes_mes: number; desligamentos_mes: number; turnover_mes: number;
  custo_competencia: { mes: string; status: string; headcount: number; folha: number; provisoes: number; patronal: number; custo_total: number } | null;
  serie_mov: { mes: string; admissoes: number; desligamentos: number }[];
  serie_custo: { mes: string; status: string; headcount: number; folha: number; provisoes: number; patronal: number; custo_total: number }[];
}

async function baixar(url: string, nomePadrao: string) {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Erro ${res.status} ao gerar o relatório`);
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const m = /filename="?([^";]+)"?/.exec(cd);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = m?.[1] || nomePadrao;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

export const relatoriosApi = {
  dashboard: () =>
    fetch(`${API_URL}/dp/dashboard/`, { headers: authHeaders() }).then((r) => j<DpDashboard>(r)),
  folhaExcel: (compId: string) =>
    baixar(`${API_URL}/dp/competencias/${compId}/relatorio/?tipo=folha&formato=excel`, "folha.xlsx"),
  rateioExcel: (compId: string) =>
    baixar(`${API_URL}/dp/competencias/${compId}/relatorio/?tipo=rateio&formato=excel`, "rateio.xlsx"),
  folhaPdf: (compId: string) =>
    baixar(`${API_URL}/dp/competencias/${compId}/relatorio/?tipo=folha&formato=pdf`, "folha.pdf"),
  rateioPdf: (compId: string) =>
    baixar(`${API_URL}/dp/competencias/${compId}/relatorio/?tipo=rateio&formato=pdf`, "rateio.pdf"),
  quadroExcel: (status = "") =>
    baixar(`${API_URL}/dp/relatorio-quadro/${status ? `?status=${status}` : ""}`, "quadro_pessoal.xlsx"),
};

// ── Previsão de gastos: projeção, aprovisionamento, simulação ──
export interface DpProjecaoLinha {
  mes: string; headcount: number; folha: number; provisoes: number;
  patronal: number; custo_total: number; provisionado_acumulado: number;
}
export interface DpProjecao {
  base: Record<string, number>;
  premissas: { meses: number; reajuste: number; mes_reajuste: number; crescimento: number };
  linhas: DpProjecaoLinha[];
  aprovisionamento: Record<string, number>;
  custo_12m: number;
}
export interface DpAdmissaoSim {
  regime: string; salario: number; vt: number; va: number;
  quantidade: number; cc_nome: string; cargo_id?: string | null;
}
export interface DpSimulacao {
  nome: string;
  atual: Record<string, number>; cenario: Record<string, number>; delta: Record<string, number>;
  novas_contratacoes: Record<string, number>;
  impacto_mensal: number; impacto_anual: number; custo_medio_por_novo: number;
  por_centro_custo: { centro_custo: string; headcount: number; custo_total: number }[];
  detalhe_novos: { nome: string; regime: string; cc: string; salario_bruto: number;
    total_pagar: number; provisoes: number; patronal: number; custo_total: number }[];
  meses: number;
}
export interface DpTabelaFiscal {
  id: string; vigencia_inicio: string;
  inss_faixas: { ate: number; aliquota: number; deducao: number }[];
  vt_percent: number; fgts_percent: number; multa_fgts_percent: number;
  inss_patronal_percent: number; provisao_base: "bruto_menos_inss" | "bruto";
}

export const previsaoApi = {
  projecao: (p: { meses?: number; reajuste?: number; mes_reajuste?: number; crescimento?: number }) => {
    const qs = new URLSearchParams();
    Object.entries(p).forEach(([k, v]) => { if (v !== undefined) qs.set(k, String(v)); });
    return fetch(`${API_URL}/dp/projecao/?${qs}`, { headers: authHeaders() }).then((r) => j<DpProjecao>(r));
  },
  simular: (body: { nome: string; admissoes: DpAdmissaoSim[]; desligamentos?: string[]; reajuste_percent?: number; meses?: number }) =>
    fetch(`${API_URL}/dp/simular/`, { method: "POST", headers: H(), body: JSON.stringify(body) })
      .then((r) => j<DpSimulacao>(r)),
  fiscais: () => fetch(`${API_URL}/dp/tabelas-fiscais/`, { headers: authHeaders() }).then((r) => j<DpTabelaFiscal[]>(r)),
  salvarFiscal: (id: string, dados: Partial<DpTabelaFiscal>) =>
    fetch(`${API_URL}/dp/tabelas-fiscais/${id}/`, { method: "PATCH", headers: H(), body: JSON.stringify(dados) })
      .then((r) => j<DpTabelaFiscal>(r)),
  criarFiscal: (dados: Partial<DpTabelaFiscal>) =>
    fetch(`${API_URL}/dp/tabelas-fiscais/`, { method: "POST", headers: H(), body: JSON.stringify(dados) })
      .then((r) => j<DpTabelaFiscal>(r)),
  salvarCargo: (id: string, dados: Partial<DpCargo>) =>
    fetch(`${API_URL}/dp/cargos/${id}/`, { method: "PATCH", headers: H(), body: JSON.stringify(dados) })
      .then((r) => j<DpCargo>(r)),
  criarCargo: (dados: Partial<DpCargo>) =>
    fetch(`${API_URL}/dp/cargos/`, { method: "POST", headers: H(), body: JSON.stringify(dados) }).then((r) => j<DpCargo>(r)),
  salvarCc: (id: string, dados: Partial<DpCentroCusto>) =>
    fetch(`${API_URL}/dp/centros-custo/${id}/`, { method: "PATCH", headers: H(), body: JSON.stringify(dados) })
      .then((r) => j<DpCentroCusto>(r)),
  criarCc: (dados: Partial<DpCentroCusto>) =>
    fetch(`${API_URL}/dp/centros-custo/`, { method: "POST", headers: H(), body: JSON.stringify(dados) })
      .then((r) => j<DpCentroCusto>(r)),
};

// Exports (Excel/PDF timbrados) de TODAS as abas
export const exportApi = {
  dashboard: () => baixar(`${API_URL}/dp/relatorio-dashboard/`, "dashboard_dp.xlsx"),
  quadro: (status = "", formato: "excel" | "pdf" = "excel") => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (formato === "pdf") qs.set("formato", "pdf");
    return baixar(`${API_URL}/dp/relatorio-quadro/?${qs}`, `quadro_pessoal.${formato === "pdf" ? "pdf" : "xlsx"}`);
  },
  folha: (compId: string, formato: "excel" | "pdf" = "excel") =>
    baixar(`${API_URL}/dp/competencias/${compId}/relatorio/?tipo=folha&formato=${formato}`, `folha.${formato === "pdf" ? "pdf" : "xlsx"}`),
  rateio: (compId: string, formato: "excel" | "pdf" = "excel") =>
    baixar(`${API_URL}/dp/competencias/${compId}/relatorio/?tipo=rateio&formato=${formato}`, `rateio.${formato === "pdf" ? "pdf" : "xlsx"}`),
  catalogos: (formato: "excel" | "pdf" = "excel") =>
    baixar(`${API_URL}/dp/relatorio-catalogos/?formato=${formato}`, `cargos_ccs.${formato === "pdf" ? "pdf" : "xlsx"}`),
  auditoria: () => baixar(`${API_URL}/dp/relatorio-auditoria/`, "auditoria_dp.xlsx"),
  projecao: (p: Record<string, number>, formato: "excel" | "pdf" = "excel") => {
    const qs = new URLSearchParams({ formato });
    Object.entries(p).forEach(([k, v]) => qs.set(k, String(v)));
    return baixar(`${API_URL}/dp/relatorio-projecao/?${qs}`, `projecao.${formato === "pdf" ? "pdf" : "xlsx"}`);
  },
  simulacao: async (resultado: DpSimulacao, formato: "excel" | "pdf" = "excel") => {
    const res = await fetch(`${API_URL}/dp/relatorio-simulacao/?formato=${formato}`, {
      method: "POST", headers: H(), body: JSON.stringify(resultado),
    });
    if (!res.ok) throw new Error(`Erro ${res.status} ao gerar o relatório`);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `simulacao.${formato === "pdf" ? "pdf" : "xlsx"}`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
  },
};

export const REGIME_LABELS: Record<string, string> = {
  estagiario: "Estagiário (TCE)", clt: "CLT", associado: "Associado", pj: "PJ",
};
export const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
export const fmtData = (iso: string | null) =>
  iso ? new Date(iso + "T12:00:00").toLocaleDateString("pt-BR") : "—";
