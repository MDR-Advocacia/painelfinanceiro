export interface PersonnelGroup {
  quantidade: number;
  salarioBase: number;
  auxilioAlimentacao: number;
  auxilioTransporte: number;
  wellhub: number;
  plr: number;
  multiplicadorEncargos: number;
}

export interface Estagiarios extends PersonnelGroup {
  bolsa: number;
  taxaIntegracao: number;
}

export type TipoSetor = 'operacional' | 'administrativo';

export type TipoCargo = 'clt' | 'estagiario';

// Pessoal is now a dynamic record of cargo keys to their data
export type Pessoal = Record<string, PersonnelGroup | Estagiarios>;

export type ModoISS = 'percentual' | 'sociedade';

export interface Faturamento {
  bruto: number;
  descontos: number; // glosas e descontos sobre o faturamento
  aliquotaLucroPresumido: number;
  aliquotaISS: number;
  modoISS: ModoISS;
  profissionaisISS: number;
  premiacaoTotal: number; // soma total da premiação mensal do centro de custo
}

export interface PeriodoData {
  pessoal: Pessoal;
  faturamento: Faturamento;
  despesasEventuais?: CustoItem[];
}

export interface Setor {
  id: string;
  nome: string;
  tipo: TipoSetor;
  sedeId?: string; // vínculo com a sede
  periodos: Record<string, PeriodoData>; // key: "2026-02"
}

export interface ImpostosCalculados {
  lucroPresumido: number;
  irpj: number;
  irpjAdicional: number;
  csll: number;
  pis: number;
  cofins: number;
  iss: number;
  total: number;
}

/** * Configuração de VPD (Valor Padrão de Despesas)
 * Baseado no método de rateio por número de funcionários
 */
export interface VpdConfig {
  id: string;
  periodo: string; // key: "2026-02"
  valor: number;   // Sugestão inicial: R$ 2.472,85
}

/**
 * Resumo Estratégico do Setor
 * Integra indicadores de eficiência operacional e lucro líquido (ROF)
 */
export interface ResumoSetor {
  custosPorCargo: Record<string, number>;
  totalCustoPessoal: number;
  totalDespesasEventuais: number;
  faturamentoBruto: number;
  impostos: ImpostosCalculados;
  cargaTributaria: number;
  faturamentoLiquido: number;
  margemBruta: number;
  margemBrutaPercent: number;
  status: 'excelente' | 'saudavel' | 'atencao' | 'critico';
  
  // Novos Indicadores Estratégicos (Estudo MDR)
  headcount: number;          // Total de profissionais no setor
  custoVPD: number;           // headcount * valor do VPD do período
  lucroLiquidoReal: number;   // ROF: Resultado Operacional Final
  margemLiquidaPercent: number; // Eficiência operacional (Lucro Líquido / Receita Total)
}

// Defaults
const defaultGroup = (multiplicadorEncargos = 1.0): PersonnelGroup => ({
  quantidade: 0, salarioBase: 0, auxilioAlimentacao: 0, auxilioTransporte: 0, wellhub: 0, plr: 0, multiplicadorEncargos,
});

const defaultEstagiario = (): Estagiarios => ({
  ...defaultGroup(), bolsa: 0, taxaIntegracao: 70,
});

const defaultFaturamento = (): Faturamento => ({
  bruto: 0, descontos: 0, aliquotaLucroPresumido: 0.32, aliquotaISS: 0.02, modoISS: 'sociedade', profissionaisISS: 0, premiacaoTotal: 0,
});

export function createDefaultPessoal(tipo: TipoSetor): Pessoal {
  return tipo === 'operacional'
    ? {
        estagiarioNivel1: defaultEstagiario(),
        estagiarioNivel2: defaultEstagiario(),
        assistenteJuridicoNivel1: defaultGroup(1.6),
        assistenteJuridicoNivel2: defaultGroup(1.6),
        advogadoJunior: defaultGroup(),
        advogadoPleno: defaultGroup(),
        advogadoSenior: defaultGroup(),
        supervisorNivel1: defaultGroup(),
        supervisorNivel2: defaultGroup(),
        coordenadorOperacional: defaultGroup(),
      } as Pessoal
    : {
        auxiliarDP: defaultGroup(),
        auxiliarRH: defaultGroup(),
        auxiliarFinanceiro: defaultGroup(),
        supervisor: defaultGroup(),
        coordenador: defaultGroup(),
      } as Pessoal;
}

export function createDefaultPeriodoData(tipo: TipoSetor): PeriodoData {
  return {
    pessoal: createDefaultPessoal(tipo),
    faturamento: defaultFaturamento(),
    despesasEventuais: [],
  };
}

export function getCurrentPeriodo(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function formatPeriodoKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export const createDefaultSetor = (nome: string, tipo: TipoSetor, periodo?: string): Setor => ({
  id: crypto.randomUUID(),
  nome,
  tipo,
  periodos: {
    [periodo ?? getCurrentPeriodo()]: createDefaultPeriodoData(tipo),
  },
});

export const CARGO_LABELS: Record<string, string> = {
  estagiarioNivel1: 'Estagiário Nível 1',
  estagiarioNivel2: 'Estagiário Nível 2',
  assistenteJuridicoNivel1: 'Assistente Jurídico Nível 1',
  assistenteJuridicoNivel2: 'Assistente Jurídico Nível 2',
  advogadoJunior: 'Advogado Júnior',
  advogadoPleno: 'Advogado Pleno',
  advogadoSenior: 'Advogado Sênior',
  supervisorNivel1: 'Supervisor Nível 1',
  supervisorNivel2: 'Supervisor Nível 2',
  coordenadorOperacional: 'Coordenador',
  auxiliarDP: 'Auxiliar Depto. Pessoal',
  auxiliarRH: 'Auxiliar RH',
  auxiliarFinanceiro: 'Auxiliar Financeiro',
  supervisor: 'Supervisor',
  coordenador: 'Coordenador',
};

export const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export type ViewMode = 'mensal' | 'trimestral' | 'semestral' | 'anual';

// === Sedes (Estrutura/Patrimônio) ===

export interface CustoItem {
  id: string;
  descricao: string;
  valor: number;
}

export interface Sede {
  id: string;
  nome: string;
  periodos: Record<string, CustoItem[]>; // key: "2026-02"
}

export const createDefaultSede = (nome: string, periodo?: string): Sede => ({
  id: crypto.randomUUID(),
  nome,
  periodos: {
    [periodo ?? getCurrentPeriodo()]: [],
  },
});