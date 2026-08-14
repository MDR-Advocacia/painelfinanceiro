// API do módulo Controle de Pessoal (DP) — F1: cadastro.
import { API_URL, authHeaders } from "@/hooks/useAuth";

export interface DpCentroCusto {
  id: string; codigo: number; nome: string; nome_curto?: string;
  pai_id?: string | null; pai_nome?: string | null; tem_filhos?: boolean;
  ativo: boolean; colaboradores_ativos: number;
}
export interface DpCcNo {
  id: string; codigo: number; nome: string; nome_curto: string; ativo: boolean;
  colaboradores_ativos: number; total_com_filhos: number; filhos: DpCcNo[];
}
export interface DpCargo {
  id: string; area: string; nome: string; salario_base: number;
  dias_mes: number; carga_horaria_mes: number; ativo: boolean;
}
export interface DpColaborador {
  id: string; matricula: number; nome: string; sexo: string; cpf: string;
  unidade: string; area: string;
  centro_custo_id: string; centro_custo_nome: string;
  supervisor_id: string | null; supervisor_nome: string | null;
  coordenador_id: string | null; coordenador_nome: string | null;
  equipe: string;
  cargo_id: string | null; cargo_nome: string | null;
  regime: "estagiario" | "clt" | "associado" | "pj"; regime_label: string;
  status: "ativo" | "inativo";
  data_entrada: string | null; data_admissao: string | null; data_demissao: string | null;
  salario_bruto: number; saldo_livre: number; vt: number; opta_vt: boolean; va: number;
  /** contrato de aprendizagem: FGTS de 2% em vez de 8% */
  aprendiz?: boolean;
  conta_bb: string; pix: string; conta_caixa: string;
  /** Situação do salário-família desta pessoa, resumida para o cadastro. */
  salario_familia?: DpSalarioFamiliaStatus;
  /** Liga esta ficha à matrícula anterior/seguinte da MESMA pessoa. */
  transferencia?: DpTransferencia | null;
}
/** Ponta de uma transferência de contrato (a outra ficha da mesma pessoa). */
export interface DpTransferenciaPonta {
  id: string; matricula: number; nome: string; regime: string;
  data: string; data_br: string; motivo: string;
}
export interface DpTransferencia {
  /** esta ficha é a continuação da matrícula abaixo */
  veio_de?: DpTransferenciaPonta;
  /** esta ficha foi encerrada e continuou na matrícula abaixo */
  continuou_como?: DpTransferenciaPonta;
}
/** Os três requisitos do salário-família avaliados juntos, como valem na prática. */
export interface DpSalarioFamiliaStatus {
  dependentes: number;
  /** dependentes que ainda geram cota (idade / invalidez) */
  cotas: number;
  pendencias: number;
  detalhe: { nome: string; pendencia: string }[];
  teto: number;
  situacao: "sem_dependente" | "nao_clt" | "sem_cota" | "acima_teto" | "pendente" | "regular";
}
export interface DpLideranca {
  id: string; nome: string; e_supervisor: boolean; e_coordenador: boolean;
  papeis: string; centro_custo_id: string | null; centro_custo_nome: string | null;
  email: string; ativo: boolean;
}
export interface DpDocumento {
  id: string; tipo: string; tipo_label: string; nome_original: string;
  tamanho: number; descricao: string; enviado_por: string;
  created_at: string; quando_br: string;
}
export interface DpPremiacaoLinha {
  nome: string; cc_id: string | null; valor: number; pessoas: number; media: number; percentual: number;
}
export interface DpPremiacoes {
  competencia: string | null; ano_ref: number | null;
  mes: DpPremiacaoLinha[]; ano: DpPremiacaoLinha[];
  serie: { mes: string; valor: number; pessoas: number }[];
  top: { nome: string; centro_custo: string; valor: number; meses: number }[];
  total_mes: number; total_ano: number; pessoas_mes: number; pessoas_ano: number;
}
export interface DpEvento {
  tipo: string; data_efeito: string; payload: Record<string, unknown>;
  autor: string; created_at: string;
}
export interface DpResumo {
  ativos: number; inativos: number; por_regime: Record<string, number>;
}
export interface DpAuditMudanca { campo: string; de: string | null; para: string }
export interface DpAuditItem {
  id: number; usuario: string; quando: string; quando_br: string;
  acao: string; verbo: string; tom: string; entidade: string; alvo: string;
  titulo: string; mudancas: DpAuditMudanca[]; resumo: string;
  colaborador_id: string | null; colaborador_nome: string;
}
export interface DpAuditFiltros {
  usuarios: string[];
  colaboradores: { id: string; nome: string }[];
  entidades: string[];
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const d = await res.json().catch(() => ({} as any));
    throw new Error((d as any).detail || `Erro ${res.status}`);
  }
  return res.json();
}
const H = () => ({ "Content-Type": "application/json", ...authHeaders() });

/** Dependente do colaborador — existe para o salário-família. */
export interface DpDependente {
  id: string;
  nome: string;
  data_nascimento: string;
  nascimento_br: string;
  idade: number;
  tipo: "filho" | "enteado" | "tutelado";
  tipo_label: string;
  cpf: string;
  invalido: boolean;
  ativo: boolean;
  observacao: string;
  vacinacao_valida_ate: string | null;
  frequencia_escolar_valida_ate: string | null;
  /** gera cota hoje? (só idade/tipo — a renda do mês é testada na folha) */
  elegivel_hoje: boolean;
  /** mês/ano em que a cota se encerra (null = inválido, sem limite) */
  cota_ate: string | null;
  /** texto da pendência de comprovação, ou "" se está em dia */
  comprovacao_pendente: string;
}

/** Afastamento ou suspensão — dias em que a pessoa não trabalha. */
export interface DpAfastamento {
  id: string;
  tipo: string; tipo_label: string;
  data_inicio: string; inicio_br: string;
  data_prevista_retorno: string | null;
  data_retorno: string | null; retorno_br: string;
  estabilidade_ate: string | null; estabilidade_br: string;
  em_estabilidade: boolean;
  em_curso: boolean;
  observacao: string;
  /** o que a regra do tipo faz na folha */
  regra: {
    dias_empresa: number | null;
    fgts: "sempre" | "dias_empresa" | "nunca";
    corta_va: boolean;
    compensa_na_guia: boolean;
  };
}

export const dpApi = {
  resumo: () => fetch(`${API_URL}/dp/colaboradores/resumo/`, { headers: authHeaders() }).then((r) => j<DpResumo>(r)),

  listar: (p: { busca?: string; regime?: string; status?: string; cc?: string; unidade?: string;
                supervisor?: string; coordenador?: string;
                /** situação do salário-família (ex.: "pendente") */
                sf?: string;
                limit?: number; offset?: number }) => {
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

  // ── documentos do colaborador (contrato em PDF) ──
  documentos: (id: string) =>
    fetch(`${API_URL}/dp/colaboradores/${id}/documentos/`, { headers: authHeaders() })
      .then((r) => j<DpDocumento[]>(r)),

  // ── afastamentos e suspensões ──
  afastamentos: (id: string) =>
    fetch(`${API_URL}/dp/colaboradores/${id}/afastamentos/`, { headers: authHeaders() })
      .then((r) => j<DpAfastamento[]>(r)),

  criarAfastamento: (id: string, dados: Record<string, unknown>) =>
    fetch(`${API_URL}/dp/colaboradores/${id}/afastamentos/`, {
      method: "POST", headers: H(), body: JSON.stringify(dados),
    }).then((r) => j<DpAfastamento>(r)),

  editarAfastamento: (id: string, afId: string, dados: Record<string, unknown>) =>
    fetch(`${API_URL}/dp/colaboradores/${id}/afastamentos/${afId}/`, {
      method: "PATCH", headers: H(), body: JSON.stringify(dados),
    }).then((r) => j<DpAfastamento>(r)),

  removerAfastamento: (id: string, afId: string) =>
    fetch(`${API_URL}/dp/colaboradores/${id}/afastamentos/${afId}/`, {
      method: "DELETE", headers: authHeaders(),
    }).then((r) => j<{ detail: string }>(r)),

  // ── transferência de contrato (mesma pessoa, matrícula nova) ──
  transferencia: (id: string) =>
    fetch(`${API_URL}/dp/colaboradores/${id}/transferencia/`, { headers: authHeaders() })
      .then((r) => j<DpTransferencia | null>(r)),

  registrarTransferencia: (id: string, dados: {
    origem_id?: string; origem_matricula?: number; data_efeito?: string;
    motivo?: string; mover_dependentes?: boolean;
  }) =>
    fetch(`${API_URL}/dp/colaboradores/${id}/transferencia/`, {
      method: "POST", headers: H(), body: JSON.stringify(dados),
    }).then((r) => j<{ transferencia: DpTransferencia; dependentes_movidos: number }>(r)),

  desfazerTransferencia: (id: string) =>
    fetch(`${API_URL}/dp/colaboradores/${id}/transferencia/`, {
      method: "DELETE", headers: authHeaders(),
    }).then((r) => j<{ detail: string; dependentes_devolvidos: number }>(r)),

  dependentes: (id: string) =>
    fetch(`${API_URL}/dp/colaboradores/${id}/dependentes/`, { headers: authHeaders() })
      .then((r) => j<DpDependente[]>(r)),

  criarDependente: (id: string, dados: Partial<DpDependente>) =>
    fetch(`${API_URL}/dp/colaboradores/${id}/dependentes/`, {
      method: "POST", headers: H(), body: JSON.stringify(dados),
    }).then((r) => j<DpDependente>(r)),

  editarDependente: (id: string, depId: string, dados: Partial<DpDependente>) =>
    fetch(`${API_URL}/dp/colaboradores/${id}/dependentes/${depId}/`, {
      method: "PATCH", headers: H(), body: JSON.stringify(dados),
    }).then((r) => j<DpDependente>(r)),

  /** Inativa (nunca apaga: quem já recebeu cota fica no histórico da folha). */
  removerDependente: (id: string, depId: string) =>
    fetch(`${API_URL}/dp/colaboradores/${id}/dependentes/${depId}/`, {
      method: "DELETE", headers: authHeaders(),
    }).then((r) => j<DpDependente>(r)),

  enviarDocumento: async (id: string, arquivo: File, tipo = "contrato", descricao = "") => {
    const fd = new FormData();
    fd.append("arquivo", arquivo);
    fd.append("tipo", tipo);
    if (descricao) fd.append("descricao", descricao);
    const res = await fetch(`${API_URL}/dp/colaboradores/${id}/documentos/`, {
      method: "POST", headers: authHeaders(), body: fd,
    });
    return j<DpDocumento>(res);
  },

  baixarDocumento: (id: string, docId: string, nome: string) =>
    baixar(`${API_URL}/dp/colaboradores/${id}/documentos/${docId}/baixar/`, nome),

  removerDocumento: async (id: string, docId: string) => {
    const r = await fetch(`${API_URL}/dp/colaboradores/${id}/documentos/${docId}/`, {
      method: "DELETE", headers: authHeaders(),
    });
    if (!r.ok && r.status !== 204) throw new Error(`Erro ${r.status}`);
  },

  /** Ficha financeira em PDF: histórico de recebimentos mês a mês. */
  fichaFinanceira: (id: string, matricula: number) =>
    baixar(`${API_URL}/dp/colaboradores/${id}/ficha-financeira/`, `ficha-financeira-${matricula}.pdf`),

  eventos: (id: string) =>
    fetch(`${API_URL}/dp/colaboradores/${id}/eventos/`, { headers: authHeaders() }).then((r) => j<DpEvento[]>(r)),

  proximaMatricula: (regime: string) =>
    fetch(`${API_URL}/dp/colaboradores/proxima_matricula/?regime=${regime}`, { headers: authHeaders() })
      .then((r) => j<{ matricula: number }>(r)),

  ccs: () => fetch(`${API_URL}/dp/centros-custo/`, { headers: authHeaders() }).then((r) => j<DpCentroCusto[]>(r)),
  ccArvore: () => fetch(`${API_URL}/dp/centros-custo/arvore/`, { headers: authHeaders() }).then((r) => j<DpCcNo[]>(r)),
  cargos: () => fetch(`${API_URL}/dp/cargos/`, { headers: authHeaders() }).then((r) => j<DpCargo[]>(r)),

  importar: (arquivo: File) => {
    const fd = new FormData();
    fd.append("arquivo", arquivo);
    return fetch(`${API_URL}/dp/importar/`, { method: "POST", headers: authHeaders(), body: fd })
      .then((r) => j<{ ccs: number; cargos: number; colaboradores_novos: number; colaboradores_atualizados: number; desligados_marcados: number; avisos: string[] }>(r));
  },

  auditoria: (limit = 50, offset = 0,
              f: { usuario?: string; colaborador?: string; entidade?: string; busca?: string } = {}) => {
    const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    Object.entries(f).forEach(([k, v]) => { if (v) qs.set(k, v); });
    return fetch(`${API_URL}/dp/auditoria/?${qs}`, { headers: authHeaders() })
      .then((r) => j<{ total: number; items: DpAuditItem[] }>(r));
  },

  auditoriaFiltros: () =>
    fetch(`${API_URL}/dp/auditoria-filtros/`, { headers: authHeaders() })
      .then((r) => j<DpAuditFiltros>(r)),

  // ── catálogo de lideranças (supervisores e coordenadores) ──
  liderancas: (papel?: "supervisor" | "coordenador", soAtivas = false) => {
    const qs = new URLSearchParams();
    if (papel) qs.set("papel", papel);
    if (soAtivas) qs.set("ativo", "1");
    return fetch(`${API_URL}/dp/liderancas/?${qs}`, { headers: authHeaders() })
      .then((r) => j<DpLideranca[]>(r));
  },

  liderancaEquipe: () =>
    fetch(`${API_URL}/dp/liderancas/equipe/`, { headers: authHeaders() })
      .then((r) => j<Record<string, { supervisionados: number; coordenados: number }>>(r)),

  criarLideranca: (dados: Partial<DpLideranca>) =>
    fetch(`${API_URL}/dp/liderancas/`, { method: "POST", headers: H(), body: JSON.stringify(dados) })
      .then((r) => j<DpLideranca>(r)),

  atualizarLideranca: (id: string, dados: Partial<DpLideranca>) =>
    fetch(`${API_URL}/dp/liderancas/${id}/`, { method: "PATCH", headers: H(), body: JSON.stringify(dados) })
      .then((r) => j<DpLideranca>(r)),

  removerLideranca: (id: string) =>
    fetch(`${API_URL}/dp/liderancas/${id}/`, { method: "DELETE", headers: authHeaders() })
      .then((r) => { if (!r.ok && r.status !== 204) throw new Error(`Erro ${r.status}`); }),
};

// ── F2: competências / folha ──
export interface DpCompetencia {
  id: string; ano: number; mes: number; mes_nome: string;
  dias_mes: number; dias_uteis: number;
  status: "aberta" | "em_revisao" | "fechada";
  aberta_por: string; enviada_revisao_por: string; fechada_por: string;
  fechada_em: string | null; total_itens: number;
  calendario?: DpCalendario; em_rescisao?: number;
}
export interface DpFolhaItem {
  id: string; colaborador_id: string; matricula: number; nome: string; regime: string;
  cargo_nome?: string; centro_custo_nome: string; salario_bruto: number;
  vt?: number; va?: number; ajuste_manual?: boolean; ajuste_motivo?: string;
  em_rescisao?: boolean; salario_com_faltas?: number; salario_com_descontos?: number;
  ferias_dias?: number; ferias_valor?: number; ferias_terco?: number; ferias_abono?: number;
  ferias_inicio?: string | null; ferias_fim?: string | null;
  faltas_dias: number; faltas_horas: number; desc_faltas: number;
  /** subconjunto das faltas que foi injustificada — só essas tiram o DSR */
  faltas_injustificadas_dias?: number;
  /** descanso semanal perdido pelas faltas injustificadas */
  desc_dsr?: number;
  afastamento_tipo?: string;
  afastamento_dias_empresa?: number;
  afastamento_dias_inss?: number;
  desc_afastamento?: number;
  /** IRRF retido — zero enquanto a tabela não for preenchida em Parâmetros */
  /** calendário de faltas: [{data:"YYYY-MM-DD", justificada:bool}] */
  faltas_datas?: { data: string; justificada?: boolean; motivo?: string }[];
  /** quantas SEMANAS tiveram falta injustificada — dita o DSR (1 por semana) */
  dsr_semanas?: number;
  desc_irrf?: number;
  /** parcela do 13º paga neste mês (entra no a-pagar, não soma custo) */
  decimo_terceiro_pago?: number;
  media_variaveis_ferias?: number;
  desc_inss: number; desc_vt: number; vt_com_faltas: number; va_com_faltas: number;
  saldo_livre: number; premiacoes: number; acerto_contabil: number;
  /** benefício previdenciário: entra no total_pagar, mas NÃO no custo_total */
  salario_familia?: number; salario_familia_cotas?: number;
  total_pagar: number; custo_provisoes: number; inss_patronal: number; custo_total: number;
  memoria: Record<string, unknown>;
}
export interface DpFolhaTotais {
  total_pagar: number; provisoes: number; inss_patronal: number; custo_total: number;
}
export interface DpRateioLinha {
  centro_custo_nome: string; nucleo: string; headcount: number;
  salarios: number; vt: number; va: number; saldo_livre: number;
  premios: number; acertos: number;
  /** parcela de CUSTO do que foi pago (já sem o salário-família) */
  folha: number;
  /** desembolso cheio, incluindo o salário-família */
  a_pagar: number;
  /** adiantado pelo escritório e compensado na GPS — não é custo */
  salario_familia: number;
  patronal: number;
  decimo: number; ferias: number; terco: number; fgts: number;
  multa_fgts: number; recesso: number; provisoes: number;
  custo: number; percentual: number;
}
export interface DpNucleoLinha {
  nucleo: string; centros: number; headcount: number; folha: number;
  provisoes: number; patronal: number; custo: number; percentual: number;
  salario_familia: number;
}
export interface DpRateio {
  linhas: DpRateioLinha[]; nucleos: DpNucleoLinha[];
  totais: Record<string, number>;
}
export interface DpCalendario {
  dias_mes: number; dias_uteis: number; fins_de_semana: number;
  feriados: { data: string; nome: string }[];
}

export const folhaApi = {
  competencias: () =>
    fetch(`${API_URL}/dp/competencias/`, { headers: authHeaders() }).then((r) => j<DpCompetencia[]>(r)),
  abrir: (ano: number, mes: number, dias_mes: number, dias_uteis: number) =>
    fetch(`${API_URL}/dp/competencias/`, { method: "POST", headers: H(), body: JSON.stringify({ ano, mes, dias_mes, dias_uteis }) })
      .then((r) => j<DpCompetencia>(r)),
  recalcular: (id: string) =>
    fetch(`${API_URL}/dp/competencias/${id}/recalcular/`, { method: "POST", headers: H() }).then((r) => j<{ itens: number }>(r)),
  itens: (id: string, p: { busca?: string; regime?: string; cc?: string;
                           /** campo de ordenação; prefixo "-" = decrescente */
                           ordem?: string;
                           limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    Object.entries(p).forEach(([k, v]) => { if (v !== undefined && v !== "") qs.set(k, String(v)); });
    return fetch(`${API_URL}/dp/competencias/${id}/itens/?${qs}`, { headers: authHeaders() })
      .then((r) => j<{ total: number; items: DpFolhaItem[]; totais: DpFolhaTotais }>(r));
  },
  rateio: (id: string) =>
    fetch(`${API_URL}/dp/competencias/${id}/rateio/`, { headers: authHeaders() }).then((r) => j<DpRateio>(r)),
  calendario: (ano: number, mes: number) =>
    fetch(`${API_URL}/dp/competencias/calendario/?ano=${ano}&mes=${mes}`, { headers: authHeaders() })
      .then((r) => j<DpCalendario>(r)),
  ajustarDias: (id: string, dias_mes: number, dias_uteis: number) =>
    fetch(`${API_URL}/dp/competencias/${id}/ajustar_dias/`, {
      method: "POST", headers: H(), body: JSON.stringify({ dias_mes, dias_uteis }),
    }).then((r) => j<DpCompetencia>(r)),
  lancar: (id: string, dados: { colaborador_id: string; faltas_dias?: number; faltas_horas?: number;
                               faltas_injustificadas_dias?: number;
                               faltas_datas?: { data: string; justificada?: boolean;
                                                motivo?: string }[];
                               premiacoes?: number; acerto_contabil?: number; obs?: string;
                               ferias_inicio?: string; ferias_dias?: number; ferias_abono_dias?: number }) =>
    fetch(`${API_URL}/dp/competencias/${id}/lancar/`, { method: "POST", headers: H(), body: JSON.stringify(dados) })
      .then((r) => j<DpFolhaItem>(r)),
  enviarRevisao: (id: string) =>
    fetch(`${API_URL}/dp/competencias/${id}/enviar_revisao/`, { method: "POST", headers: H() }).then((r) => j<DpCompetencia>(r)),
  aprovar: (id: string) =>
    fetch(`${API_URL}/dp/competencias/${id}/aprovar/`, { method: "POST", headers: H() }).then((r) => j<DpCompetencia>(r)),
  desfazerRevisao: (id: string) =>
    fetch(`${API_URL}/dp/competencias/${id}/desfazer_revisao/`, { method: "POST", headers: H() })
      .then((r) => j<DpCompetencia>(r)),
  ajustar: (id: string, dados: { colaborador_id: string; salario?: number | null; vt?: number | null;
    va?: number | null; saldo_livre?: number | null; motivo: string }) =>
    fetch(`${API_URL}/dp/competencias/${id}/ajustar/`, { method: "POST", headers: H(), body: JSON.stringify(dados) })
      .then((r) => j<DpFolhaItem>(r)),
  reabrir: (id: string, justificativa: string) =>
    fetch(`${API_URL}/dp/competencias/${id}/reabrir/`, { method: "POST", headers: H(), body: JSON.stringify({ justificativa }) })
      .then((r) => j<DpCompetencia>(r)),
};

// ── F4: dashboard + relatórios timbrados ──
export interface DpDashboard {
  /** "fechadas" | "todas" — de onde vieram os KPIs */
  escopo?: string;
  competencia_base?: { ano: number; mes: number; mes_nome: string; status: string } | null;
  competencias_fechadas?: number;
  headcount: number; por_regime: Record<string, number>;
  admissoes_mes: number; desligamentos_mes: number; turnover_mes: number;
  custo_competencia: { mes: string; status: string; headcount: number; folha: number; provisoes: number; patronal: number; custo_total: number } | null;
  serie_mov: { mes: string; admissoes: number; desligamentos: number }[];
  serie_custo: { mes: string; status: string; headcount: number; folha: number; provisoes: number;
    patronal: number; custo_total: number; admissoes?: number; desligamentos?: number;
    turnover?: number; custo_clt?: number; fgts?: number; multa_fgts?: number;
    fgts_acumulado?: number; multa_fgts_acumulada?: number }[];
  // análises extras
  por_unidade: { nome: string; quantidade: number }[];
  por_area: { nome: string; quantidade: number }[];
  por_cc_qtd: { nome: string; quantidade: number; salario_medio: number }[];
  custo_por_cc: { nome: string; quantidade: number; custo: number; custo_medio: number }[];
  custo_por_regime: { regime: string; quantidade: number; custo: number; custo_medio: number }[];
  custo_por_cargo: { cargo: string; regime: string; quantidade: number; custo: number;
    custo_medio: number; salario_medio: number }[];
  custo_medio_pessoa: number;
  participacao: { folha?: number; provisoes?: number; patronal?: number };
  variacao_custo: { percent: number; valor: number } | null;
  tempo_casa: { faixa: string; quantidade: number }[];
  alertas: { tipo: string; texto: string }[];
  folha_media_salario: number;
  premiacoes: DpPremiacoes;
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
  /** escopo "fechadas" (default) usa só competências fechadas; "todas" inclui a aberta */
  dashboard: (escopo: "fechadas" | "todas" = "fechadas") =>
    fetch(`${API_URL}/dp/dashboard/?escopo=${escopo}`, { headers: authHeaders() })
      .then((r) => j<DpDashboard>(r)),
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
  /**
   * Exporta o quadro com O MESMO recorte da tela. Antes só o status ia junto,
   * então exportar "com filtro" baixava o quadro inteiro e o operador conferia
   * uma planilha que não era a que ele estava vendo.
   */
  quadro: (filtros: { status?: string; regime?: string; busca?: string;
                      cc?: string; unidade?: string } = {},
           formato: "excel" | "pdf" = "excel") => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(filtros)) if (v) qs.set(k, v);
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

export interface DpOpcoesEscopo {
  unidades: string[]; areas: string[];
  centros_custo: { id: string; nome: string }[];
  setores: { id: string; nome: string }[];
  sedes: { id: string; nome: string }[];
}
export const escopoApi = {
  opcoes: () => fetch(`${API_URL}/dp/opcoes-escopo/`, { headers: authHeaders() }).then((r) => j<DpOpcoesEscopo>(r)),
};

// ── Desligamento / verbas rescisórias ──
export interface DpVerba { descricao: string; valor: number; memoria: string }
export interface DpRescisaoCalc {
  colaborador: Record<string, unknown>;
  tipo: string; tipo_label: string; data_desligamento: string; dias_aviso: number;
  verbas: DpVerba[]; descontos: DpVerba[];
  proventos: number; total_descontos: number; liquido: number;
}
export interface DpRescisaoRegistro extends DpRescisaoCalc {
  id: string; colaborador_id: string; matricula: number; nome: string;
  regime: string; motivo: string; criado_por: string; created_at: string;
}

export const rescisaoApi = {
  listar: () => fetch(`${API_URL}/dp/rescisoes/`, { headers: authHeaders() })
    .then((r) => j<DpRescisaoRegistro[]>(r)),
  simular: (body: { colaborador_id: string; data_desligamento: string; tipo: string; opcoes?: Record<string, unknown> }) =>
    fetch(`${API_URL}/dp/rescisoes/simular/`, { method: "POST", headers: H(), body: JSON.stringify(body) })
      .then((r) => j<DpRescisaoCalc>(r)),
  efetivar: (body: { colaborador_id: string; data_desligamento: string; tipo: string; motivo?: string; opcoes?: Record<string, unknown> }) =>
    fetch(`${API_URL}/dp/rescisoes/efetivar/`, { method: "POST", headers: H(), body: JSON.stringify(body) })
      .then((r) => j<DpRescisaoRegistro>(r)),
  termo: (id: string) => baixar(`${API_URL}/dp/rescisoes/${id}/termo/`, "termo_rescisao.pdf"),
};

export const REGIME_LABELS: Record<string, string> = {
  estagiario: "Estagiário (TCE)", clt: "CLT", associado: "Associado", pj: "PJ",
};
export const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
export const fmtData = (iso: string | null) =>
  iso ? new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "—";

/** "2026-07" -> "jul/2026" (nunca mostrar aaaa-mm cru) */
export const fmtCompetencia = (mesAno: string) => {
  const [a, m] = (mesAno || "").split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const i = Number(m) - 1;
  return nomes[i] ? `${nomes[i]}/${a}` : mesAno;
};

/** "2026-07" -> "Julho de 2026" */
export const fmtCompetenciaLonga = (mesAno: string) => {
  const [a, m] = (mesAno || "").split("-");
  const nomes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const i = Number(m) - 1;
  return nomes[i] ? `${nomes[i]} de ${a}` : mesAno;
};

export const STATUS_COMPETENCIA: Record<string, string> = {
  aberta: "Aberta", em_revisao: "Em revisão", fechada: "Fechada",
};
