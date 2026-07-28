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

export const REGIME_LABELS: Record<string, string> = {
  estagiario: "Estagiário (TCE)", clt: "CLT", associado: "Associado", pj: "PJ",
};
export const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
export const fmtData = (iso: string | null) =>
  iso ? new Date(iso + "T12:00:00").toLocaleDateString("pt-BR") : "—";
