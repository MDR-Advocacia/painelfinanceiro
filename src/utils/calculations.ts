import type { Setor, Estagiarios, PersonnelGroup, Faturamento, ImpostosCalculados, ResumoSetor, PeriodoData, ViewMode } from "@/types/sector";

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

export function calcImpostos(fat: Faturamento): ImpostosCalculados {
  const fb = fat.bruto;
  const aliqLP = fat.aliquotaLucroPresumido;
  const lucroPresumido = fb * aliqLP;

  const irpj = lucroPresumido * 0.15;
  const trimestral = lucroPresumido * 3;
  const irpjAdicional = trimestral > 60000 ? ((trimestral - 60000) * 0.10) / 3 : 0;

  const csll = lucroPresumido * 0.09;
  const pis = fb * 0.0065;
  const cofins = fb * 0.03;

  const modoISS = fat.modoISS ?? 'percentual';
  const iss = modoISS === 'sociedade'
    ? calcISSSociedade(fat.profissionaisISS ?? 0)
    : fb * fat.aliquotaISS;

  const total = irpj + irpjAdicional + csll + pis + cofins + iss;
  return { lucroPresumido, irpj, irpjAdicional, csll, pis, cofins, iss, total };
}

export function calcResumo(data: PeriodoData): ResumoSetor {
  const { custosPorCargo, total: totalCustoPessoal } = calcTotalPessoal(data.pessoal as any);

  const fb = data.faturamento.bruto;
  const descontos = data.faturamento.descontos ?? 0;
  const premiacaoTotal = data.faturamento.premiacaoTotal ?? 0;
  const impostos = calcImpostos(data.faturamento);
  const cargaTributaria = fb > 0 ? (impostos.total / fb) * 100 : 0;
  const faturamentoLiquido = fb - impostos.total - descontos;
  const margemBruta = faturamentoLiquido - totalCustoPessoal - premiacaoTotal;
  const margemBrutaPercent = fb > 0 ? (margemBruta / fb) * 100 : 0;

  let status: ResumoSetor['status'] = 'critico';
  if (margemBrutaPercent > 70) status = 'excelente';
  else if (margemBrutaPercent > 50) status = 'saudavel';
  else if (margemBrutaPercent > 30) status = 'atencao';

  return {
    custosPorCargo, totalCustoPessoal, faturamentoBruto: fb, impostos, cargaTributaria,
    faturamentoLiquido, margemBruta, margemBrutaPercent, status,
  };
}

/** Get the resumo for a setor in a specific period */
export function getSetorResumo(setor: Setor, periodo: string): ResumoSetor {
  const data = setor.periodos[periodo];
  if (!data) return emptyResumo();
  return calcResumo(data);
}

/** Aggregate resumos by summing values */
export function aggregateResumos(resumos: ResumoSetor[]): ResumoSetor {
  if (resumos.length === 0) return emptyResumo();

  const custosPorCargo: Record<string, number> = {};
  let totalCustoPessoal = 0;
  let faturamentoBruto = 0;
  let totalImpostos = 0;

  for (const r of resumos) {
    for (const [k, v] of Object.entries(r.custosPorCargo)) {
      custosPorCargo[k] = (custosPorCargo[k] ?? 0) + v;
    }
    totalCustoPessoal += r.totalCustoPessoal;
    faturamentoBruto += r.faturamentoBruto;
    totalImpostos += r.impostos.total;
  }

  const cargaTributaria = faturamentoBruto > 0 ? (totalImpostos / faturamentoBruto) * 100 : 0;
  const faturamentoLiquido = faturamentoBruto - totalImpostos;
  const margemBruta = faturamentoLiquido - totalCustoPessoal;
  const margemBrutaPercent = faturamentoBruto > 0 ? (margemBruta / faturamentoBruto) * 100 : 0;

  let status: ResumoSetor['status'] = 'critico';
  if (margemBrutaPercent > 70) status = 'excelente';
  else if (margemBrutaPercent > 50) status = 'saudavel';
  else if (margemBrutaPercent > 30) status = 'atencao';

  // Sum impostos
  const impostos: ImpostosCalculados = {
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
    custosPorCargo, totalCustoPessoal, faturamentoBruto, impostos, cargaTributaria,
    faturamentoLiquido, margemBruta, margemBrutaPercent, status,
  };
}

function emptyResumo(): ResumoSetor {
  return {
    custosPorCargo: {}, totalCustoPessoal: 0, faturamentoBruto: 0,
    impostos: { lucroPresumido: 0, irpj: 0, irpjAdicional: 0, csll: 0, pis: 0, cofins: 0, iss: 0, total: 0 },
    cargaTributaria: 0, faturamentoLiquido: 0, margemBruta: 0, margemBrutaPercent: 0, status: 'critico',
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
export function getSetorResumoForPeriod(setor: Setor, periodo: string, mode: ViewMode): ResumoSetor {
  const months = getMonthsForPeriod(periodo, mode);
  const resumos = months
    .filter(m => setor.periodos[m])
    .map(m => calcResumo(setor.periodos[m]));
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
