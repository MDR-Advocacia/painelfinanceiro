import type { 
  Setor, 
  Estagiarios, 
  PersonnelGroup, 
  Faturamento, 
  ImpostosCalculados, 
  ResumoSetor, 
  PeriodoData, 
  ViewMode,
  VpdConfig
} from "@/types/sector";

export function calcCustoGrupo(g: PersonnelGroup | Estagiarios): number {
  const plr = (g.plr ?? 0) / 12;
  if ('bolsa' in g) {
    return (g.bolsa + g.auxilioAlimentacao + g.auxilioTransporte + g.wellhub + g.taxaIntegracao + plr) * g.quantidade;
  }
  const mult = g.multiplicadorEncargos ?? 1.0;
  return ((g.salarioBase * mult) + g.auxilioAlimentacao + g.auxilioTransporte + g.wellhub + plr) * g.quantidade;
}

export function calcTotalPessoal(pessoal: Record<string, PersonnelGroup | Estagiarios>): { custosPorCargo: Record<string, number>; total: number } {
  const custosPorCargo: Record<string, number> = {};
  let total = 0;
  for (const [key, grupo] of Object.entries(pessoal)) {
    const custo = calcCustoGrupo(grupo);
    custosPorCargo[key] = custo;
    total += custo;
  }
  return { custosPorCargo, total };
}

/** Calcula ISS no modo sociedade de advogados (bimestral por profissional, rateado mensalmente) */
export function calcISSSociedade(numProfissionais: number): number {
  if (numProfissionais <= 0) return 0;
  let totalBimestral = 0;
  for (let i = 1; i <= numProfissionais; i++) {
    if (i <= 3) totalBimestral += 452;
    else if (i <= 6) totalBimestral += 537;
    else if (i <= 9) totalBimestral += 622;
    else if (i <= 12) totalBimestral += 707;
    else totalBimestral += 792;
  }
  return totalBimestral / 2; // bimestral → mensal
}

/**
 * BASE DE CÁLCULO = RECEITA LÍQUIDA (bruto menos descontos/glosa).
 *
 * Decisão fiscal do escritório: o valor glosado não foi faturado, então não
 * pode sofrer tributação. Vale pra tudo que é proporcional à receita — PIS,
 * COFINS, ISS percentual e o lucro presumido que alimenta IRPJ e CSLL.
 * O ISS no modo sociedade é fixo por profissional: glosa não o altera.
 *
 * ESPELHO de `_impostos` em backend-mdr/financeiro/estrutura_views.py.
 * Mexeu aqui, mexe lá — as duas TÊM que dar o mesmo número.
 */
export function calcImpostos(fat: Faturamento): ImpostosCalculados {
  const descontos = fat.descontos ?? 0;
  // glosa maior que o bruto não vira base negativa
  const baseCalculo = Math.max(0, fat.bruto - descontos);
  const aliqLP = fat.aliquotaLucroPresumido;
  const lucroPresumido = baseCalculo * aliqLP;

  const irpj = lucroPresumido * 0.15;
  const trimestral = lucroPresumido * 3;
  const irpjAdicional = trimestral > 60000 ? ((trimestral - 60000) * 0.10) / 3 : 0;

  const csll = lucroPresumido * 0.09;
  const pis = baseCalculo * 0.0065;
  const cofins = baseCalculo * 0.03;

  const modoISS = fat.modoISS ?? 'percentual';
  const iss = modoISS === 'sociedade'
    ? calcISSSociedade(fat.profissionaisISS ?? 0)
    : baseCalculo * fat.aliquotaISS;

  const total = irpj + irpjAdicional + csll + pis + cofins + iss;
  return { baseCalculo, lucroPresumido, irpj, irpjAdicional, csll, pis, cofins, iss, total };
}

/**
 * Busca o valor do VPD para um período específico
 * Caso não exista configuração, utiliza o valor base do estudo de R$ 2.472,85
 */
export function getVpdValor(configs: VpdConfig[], periodo: string): number {
  const config = configs.find(c => c.periodo === periodo);
  return config ? config.valor : 2472.85; // Valor padrão sugerido no PDF
}

/**
 * Calcula o Resumo Estratégico Completo
 * Integra o rateio por número de funcionários (VPD) e o Lucro Líquido (ROF)
 */
export function calcResumo(data: PeriodoData, vpdValor: number = 2472.85): ResumoSetor {
  // BLINDAGEM: um período pode existir só com custoPessoalReal (o espelho da
  // folha cria a entrada quando o setor não tinha nada lançado no mês). Sem
  // esses defaults, data.pessoal indefinido derrubava o React inteiro — foi a
  // tela branca de 12/08/2026 em produção.
  const pessoalSeguro = data.pessoal ?? {};
  const fatSeguro: Faturamento = data.faturamento ?? {
    bruto: 0, descontos: 0, aliquotaLucroPresumido: 0.32, aliquotaISS: 0.02,
    modoISS: "sociedade", profissionaisISS: 0, premiacaoTotal: 0, diversosTotal: 0,
  };
  const { custosPorCargo, total: estimativaPessoal } = calcTotalPessoal(pessoalSeguro as any);
  // `custoPessoalReal` vem da FOLHA fechada do DP, espelhada no setor quando a
  // competência é calculada. Quando existe, ele manda: o bloco `pessoal` é uma
  // ESTIMATIVA por cargo (quantidade × salário × multiplicador de encargos) e
  // ficava 25% abaixo da folha de verdade — em 06/2026 dava R$ 358.455 contra
  // R$ 478.122 reais, e o operador via dois números pra mesma coisa.
  // Preferencia: (1) custo COM o apoio rateado, (2) custo direto, (3) estimativa.
  // O apoio (Administrativo e TI) serve todas as linhas; sem ratear, cada
  // cliente parece mais rentavel do que e' — sao 13,3% do quadro fora da conta.
  const comApoio = (data as any).custoPessoalComApoio as number | undefined;
  const real = (data as any).custoPessoalReal as number | undefined;
  // ZERO E' RESPOSTA, NAO AUSENCIA. O setor de apoio tem custoPessoalComApoio
  // = 0 de proposito: o custo dele foi todo rateado nas linhas. Testar "> 0"
  // fazia ele cair no fallback e somar o custo DIRETO de novo — os R$ 94.709 do
  // Administrativo e do TI entravam duas vezes e junho aparecia como 572.831
  // contra 478.122 da folha.
  const totalCustoPessoal = comApoio !== undefined
    ? comApoio
    : real !== undefined && real > 0 ? real : estimativaPessoal;
  // quebra do custo, pra tela poder mostrar o backoffice em coluna propria em
  // vez de deixa-lo escondido dentro de "custos de pessoal"
  const custoBackoffice = ((data as any).custoApoioRateado as number | undefined) ?? 0;
  const custoPessoalDireto = Math.max(totalCustoPessoal - custoBackoffice, 0);
  // mesmo raciocinio do custo: o quadro DIGITADO por cargo e' desenho, o
  // cadastro do DP e' o fato. Em 05/2026 o digitado dizia 178 contra 173 ativos.
  // Aqui doi duas vezes, porque o VPD e' rateado POR CABECA — cada pessoa
  // fantasma vira despesa indireta fantasma na margem do cliente.
  const hcApoio = (data as any).headcountComApoio as number | undefined;
  const hcReal = (data as any).headcountReal as number | undefined;
  const headcount = hcApoio !== undefined
    ? hcApoio
    : hcReal !== undefined && hcReal > 0 ? hcReal : getTotalProfissionais(pessoalSeguro as any);

  const totalDespesasEventuais = (data.despesasEventuais || []).reduce((sum, item) => sum + item.valor, 0);

  const fb = fatSeguro.bruto;
  const descontos = fatSeguro.descontos ?? 0;
  const premiacaoTotal = fatSeguro.premiacaoTotal ?? 0;
  const diversosTotal = fatSeguro.diversosTotal ?? 0;
  const totalVariaveis = premiacaoTotal + diversosTotal;
  const impostos = calcImpostos(fatSeguro);
  
  // carga tributária medida contra a receita que de fato foi tributada (líquida),
  // e não contra o bruto — senão a glosa faria a carga parecer menor do que é
  const cargaTributaria = impostos.baseCalculo > 0
    ? (impostos.total / impostos.baseCalculo) * 100
    : 0;
  const faturamentoLiquido = fb - impostos.total - descontos;
  
  // Margem Bruta (antes do rateio das despesas indiretas)
  const margemBruta = faturamentoLiquido - totalCustoPessoal - totalVariaveis - totalDespesasEventuais;
  const margemBrutaPercent = fb > 0 ? (margemBruta / fb) * 100 : 0;

  // Resultado Operacional Final (ROF) - Lucro Líquido Real
  // Fórmula: Receita Líquida - Impostos - Custos Operacionais (Pessoal) - Despesas Operacionais (VPD)
  const custoVPD = headcount * vpdValor;
  const lucroLiquidoReal = faturamentoLiquido - totalCustoPessoal - totalVariaveis - totalDespesasEventuais - custoVPD;
  const margemLiquidaPercent = fb > 0 ? (lucroLiquidoReal / fb) * 100 : 0;

  let status: ResumoSetor['status'] = 'critico';
  // Interpretação: margens líquidas altas sinalizam boa gestão e saúde financeira
  if (margemLiquidaPercent > 25) status = 'excelente';
  else if (margemLiquidaPercent > 15) status = 'saudavel';
  else if (margemLiquidaPercent > 5) status = 'atencao';

  return {
    custosPorCargo,
    totalCustoPessoal,
    custoPessoalDireto,
    custoBackoffice,
    premiacaoTotal,
    diversosTotal,
    totalVariaveis,
    totalDespesasEventuais,
    faturamentoBruto: fb,
    impostos,
    cargaTributaria,
    faturamentoLiquido,
    margemBruta,
    margemBrutaPercent,
    status,
    headcount,
    custoVPD,
    lucroLiquidoReal,
    margemLiquidaPercent
  };
}

/** Get the resumo for a setor in a specific period */
export function getSetorResumo(setor: Setor, periodo: string, vpdValor: number = 2472.85): ResumoSetor {
  const data = setor.periodos[periodo];
  if (!data) return emptyResumo();
  return calcResumo(data, vpdValor);
}

/** Aggregate resumos by summing values and weighted averaging percentages */
export function aggregateResumos(resumos: ResumoSetor[]): ResumoSetor {
  if (resumos.length === 0) return emptyResumo();

  const custosPorCargo: Record<string, number> = {};
  let totalCustoPessoal = 0;
  let custoPessoalDireto = 0;
  let custoBackoffice = 0;
  let totalDespesasEventuais = 0;
  let faturamentoBruto = 0;
  let premiacaoTotal = 0;
  let diversosTotal = 0;
  let totalVariaveis = 0;
  let totalImpostos = 0;
  let headcount = 0;
  let custoVPD = 0;
  let lucroLiquidoReal = 0;
  let faturamentoLiquido = 0;

  for (const r of resumos) {
    for (const [k, v] of Object.entries(r.custosPorCargo)) {
      custosPorCargo[k] = (custosPorCargo[k] ?? 0) + v;
    }
    totalCustoPessoal += r.totalCustoPessoal;
    custoPessoalDireto += r.custoPessoalDireto ?? 0;
    custoBackoffice += r.custoBackoffice ?? 0;
    totalDespesasEventuais += r.totalDespesasEventuais;
    faturamentoBruto += r.faturamentoBruto;
    premiacaoTotal += r.premiacaoTotal;
    diversosTotal += r.diversosTotal;
    totalVariaveis += r.totalVariaveis;
    totalImpostos += r.impostos.total;
    headcount += r.headcount;
    custoVPD += r.custoVPD;
    lucroLiquidoReal += r.lucroLiquidoReal;
    faturamentoLiquido += r.faturamentoLiquido;
  }

  const margemBruta = faturamentoLiquido - totalCustoPessoal - totalDespesasEventuais;
  const margemBrutaPercent = faturamentoBruto > 0 ? (margemBruta / faturamentoBruto) * 100 : 0;
  const margemLiquidaPercent = faturamentoBruto > 0 ? (lucroLiquidoReal / faturamentoBruto) * 100 : 0;

  let status: ResumoSetor['status'] = 'critico';
  if (margemLiquidaPercent > 25) status = 'excelente';
  else if (margemLiquidaPercent > 15) status = 'saudavel';
  else if (margemLiquidaPercent > 5) status = 'atencao';

  const impostos: ImpostosCalculados = {
    baseCalculo: resumos.reduce((a, r) => a + r.impostos.baseCalculo, 0),
    lucroPresumido: resumos.reduce((a, r) => a + r.impostos.lucroPresumido, 0),
    irpj: resumos.reduce((a, r) => a + r.impostos.irpj, 0),
    irpjAdicional: resumos.reduce((a, r) => a + r.impostos.irpjAdicional, 0),
    csll: resumos.reduce((a, r) => a + r.impostos.csll, 0),
    pis: resumos.reduce((a, r) => a + r.impostos.pis, 0),
    cofins: resumos.reduce((a, r) => a + r.impostos.cofins, 0),
    iss: resumos.reduce((a, r) => a + r.impostos.iss, 0),
    total: totalImpostos,
  };

  return {
    custosPorCargo, totalCustoPessoal, custoPessoalDireto, custoBackoffice,
    totalDespesasEventuais, faturamentoBruto, premiacaoTotal, diversosTotal, totalVariaveis, impostos, 
    // denominador é a base tributada (líquida), coerente com calcImpostos
    cargaTributaria: impostos.baseCalculo > 0
      ? (totalImpostos / impostos.baseCalculo) * 100 : 0,
    faturamentoLiquido, margemBruta, margemBrutaPercent, status,
    headcount, custoVPD, lucroLiquidoReal, margemLiquidaPercent
  };
}

function emptyResumo(): ResumoSetor {
  return {
    custosPorCargo: {}, totalCustoPessoal: 0, custoPessoalDireto: 0, custoBackoffice: 0, totalDespesasEventuais: 0, faturamentoBruto: 0, premiacaoTotal: 0,
    diversosTotal: 0, totalVariaveis:0,
    impostos: { baseCalculo: 0, lucroPresumido: 0, irpj: 0, irpjAdicional: 0, csll: 0, pis: 0, cofins: 0, iss: 0, total: 0 },
    cargaTributaria: 0, faturamentoLiquido: 0, margemBruta: 0, margemBrutaPercent: 0, status: 'critico',
    headcount: 0, custoVPD: 0, lucroLiquidoReal: 0, margemLiquidaPercent: 0
  };
}

/** Get month keys for a given period */
export function getMonthsForPeriod(periodo: string, mode: ViewMode): string[] {
  const [year, month] = periodo.split('-').map(Number);
  switch (mode) {
    case 'mensal':
      return [periodo];
    case 'trimestral': {
      const q = Math.floor((month - 1) / 3);
      const start = q * 3 + 1;
      return [0, 1, 2].map(i => `${year}-${String(start + i).padStart(2, '0')}`);
    }
    case 'semestral': {
      const s = month <= 6 ? 1 : 7;
      return Array.from({ length: 6 }, (_, i) => `${year}-${String(s + i).padStart(2, '0')}`);
    }
    case 'anual':
      return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  }
}

/** Get aggregated resumo for a setor in a period range */
export function getSetorResumoForPeriod(setor: Setor, periodo: string, mode: ViewMode, vpdValor: number = 2472.85): ResumoSetor {
  const months = getMonthsForPeriod(periodo, mode);
  const resumos = months
    .filter(m => setor.periodos[m])
    .map(m => calcResumo(setor.periodos[m], vpdValor));
  return resumos.length > 0 ? aggregateResumos(resumos) : emptyResumo();
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function getStatusColor(status: ResumoSetor['status']): string {
  switch (status) {
    case 'excelente': return 'text-success';
    case 'saudavel': return 'text-success';
    case 'atencao': return 'text-warning';
    case 'critico': return 'text-destructive';
  }
}

export function getStatusLabel(status: ResumoSetor['status']): string {
  switch (status) {
    case 'excelente': return 'Excelente';
    case 'saudavel': return 'Saudável';
    case 'atencao': return 'Atenção';
    case 'critico': return 'Crítico';
  }
}

export function getTotalProfissionais(pessoal: Record<string, any>): number {
  return Object.values(pessoal).reduce((sum: number, g: any) => sum + (g.quantidade ?? 0), 0);
}