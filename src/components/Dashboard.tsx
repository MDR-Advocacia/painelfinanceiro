import { useApp } from "@/contexts/AppContext";
import { getSetorResumoForPeriod, formatCurrency, formatPercent, getStatusLabel, getStatusColor, getTotalProfissionais } from "@/utils/calculations";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PeriodSelector } from "@/components/PeriodSelector";
import { MONTH_NAMES } from "@/types/sector";
import type { ViewMode } from "@/types/sector";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { DollarSign, TrendingUp, Users, AlertTriangle, Building2, Award } from "lucide-react"; // <-- Adicionado o ícone Award

// Paleta DunaTech (família Flow): azul elétrico + navy + tints, semânticos por último
const CHART_COLORS = ["#1E7BFF", "#0A1940", "#7FB5FF", "#27AE60", "#F39C12", "#E74C3C"];

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

export function Dashboard() {
  const { setores, sedes, setActiveSetor, periodoAtivo, setPeriodoAtivo, viewMode, setViewMode, currentVpdValor } = useApp();
  
  // Estados dos filtros
  const [filtroSede, setFiltroSede] = useState<string>("todas");
  const [filtroSetor, setFiltroSetor] = useState<string>("todos");
  
  // 1. Aplica os filtros na lista de setores ANTES de calcular os resumos
  const setoresFiltrados = setores.filter(s => {
    const passaSede = filtroSede === "todas" || s.sedeId === filtroSede;
    const passaSetor = filtroSetor === "todos" || s.id === filtroSetor;
    return passaSede && passaSetor;
  });

  // 2. Gera os resumos usando apenas os setores filtrados
  const resumos = setoresFiltrados.map(s => ({
    setor: s,
    resumo: getSetorResumoForPeriod(s, periodoAtivo, viewMode, currentVpdValor),
  }));

  // 3. Cálculos Originais
  const totalFaturamento = resumos.reduce((a, r) => a + r.resumo.faturamentoBruto, 0);
  const totalImpostos = resumos.reduce((a, r) => a + r.resumo.impostos.total, 0);
  const totalCustos = resumos.reduce((a, r) => a + r.resumo.totalCustoPessoal, 0);
  const lucroLiquidoConsolidado = resumos.reduce((a, r) => a + r.resumo.lucroLiquidoReal, 0);
  const margemLiquidaPercent = totalFaturamento > 0 ? (lucroLiquidoConsolidado / totalFaturamento) * 100 : 0;
  
  // Obs: Ajustado para contar os profissionais apenas dos setores filtrados
  const totalProfissionais = setoresFiltrados.reduce((a, s) => {
    const data = s.periodos[periodoAtivo];
    return a + (data ? getTotalProfissionais(data.pessoal as any) : 0);
  }, 0);

  // 4. Novos Cálculos (Lucro Bruto, VPD, Variáveis)
  const totalVariaveis = resumos.reduce((a, r) => a + r.resumo.totalVariaveis, 0);
  const totalVPD = resumos.reduce((a, r) => a + r.resumo.custoVPD, 0);
  const lucroBrutoConsolidado = resumos.reduce((a, r) => a + r.resumo.margemBruta, 0);
  const margemBrutaPercent = totalFaturamento > 0 ? (lucroBrutoConsolidado / totalFaturamento) * 100 : 0;

  const [year, month] = periodoAtivo.split('-').map(Number);
  const periodLabel = viewMode === 'mensal' ? `${MONTH_NAMES[month - 1]} ${year}`
    : viewMode === 'trimestral' ? `${Math.ceil(month / 3)}º Tri ${year}`
    : viewMode === 'semestral' ? `${month <= 6 ? '1º' : '2º'} Sem ${year}`
    : `${year}`;

  const barData = resumos.map(r => ({
    name: r.setor.nome.length > 12 ? r.setor.nome.slice(0, 12) + '…' : r.setor.nome,
    Faturamento: r.resumo.faturamentoBruto,
    Custos: r.resumo.totalCustoPessoal,
    Impostos: r.resumo.impostos.total,
  }));

  const pieData = resumos.filter(r => r.resumo.faturamentoBruto > 0).map(r => ({
    name: r.setor.nome,
    value: r.resumo.faturamentoBruto,
  }));

  return (
    <div className="animate-fade-in space-y-6">
      {/* cabeçalho fixo: o período e os filtros acompanham a rolagem — em
          tela longa, perder o contexto do que se está olhando é o pior erro */}
      <div className="topbar sticky top-0 z-30 -mx-6 -mt-6 flex flex-wrap items-end justify-between gap-4 px-6 py-4 md:-mx-8 md:-mt-8 md:px-8">
        <div>
          <p className="eyebrow">Visão consolidada</p>
          <h2 className="mt-1 font-heading text-2xl font-bold text-foreground">Dashboard</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {periodLabel} · visão {VIEW_MODE_LABELS[viewMode].toLowerCase()}
            {filtroSede !== "todas" && <> · {sedes.find((s) => s.id === filtroSede)?.nome}</>}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex bg-muted rounded-lg p-0.5">
            {(['mensal', 'trimestral', 'semestral', 'anual'] as ViewMode[]).map(m => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  viewMode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {VIEW_MODE_LABELS[m]}
              </button>
            ))}
          </div>

          {/* Novos Filtros de Sede e Setor */}
          <div className="flex gap-2 ml-2">
            <Select value={filtroSede} onValueChange={(v) => { setFiltroSede(v); setFiltroSetor('todos'); }}>
              <SelectTrigger className="w-[140px] h-9 text-xs">
                <SelectValue placeholder="Todas as Sedes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as Sedes</SelectItem>
                {sedes?.map(sede => (
                  <SelectItem key={sede.id} value={sede.id}>{sede.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filtroSetor} onValueChange={setFiltroSetor}>
              <SelectTrigger className="w-[140px] h-9 text-xs">
                <SelectValue placeholder="Todos os Setores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Setores</SelectItem>
                {setores
                  .filter(s => filtroSede === "todas" || s.sedeId === filtroSede)
                  .map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <PeriodSelector value={periodoAtivo} onChange={setPeriodoAtivo} />
        </div>
      </div>

      {setores.length === 0 ? (
        <Card className="glass-card border-0">
          <CardContent className="py-16 text-center">
            <Building2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="font-heading text-lg font-semibold text-muted-foreground">Nenhum setor cadastrado</h3>
            <p className="text-sm text-muted-foreground/60 mt-1">Crie seu primeiro setor usando o botão na barra lateral</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Grade alterada para 4 colunas em telas médias/grandes para comportar os 8 cards em 2 linhas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard icon={DollarSign} label="Faturamento Total" value={formatCurrency(totalFaturamento)} />
            <KPICard icon={AlertTriangle} label="Total Impostos" value={formatCurrency(totalImpostos)} color="text-warning" />
            <KPICard icon={Users} label="Custos de Pessoal" value={formatCurrency(totalCustos)} color="text-destructive" />
            <KPICard icon={Award} label="Var. Centro de Custo" value={formatCurrency(totalVariaveis)} color="text-destructive" />
            
            <KPICard icon={DollarSign} label="Lucro Bruto" value={formatCurrency(lucroBrutoConsolidado)} sub={formatPercent(margemBrutaPercent)} color={lucroBrutoConsolidado >= 0 ? 'text-success' : 'text-destructive'} />
            <KPICard icon={Building2} label="Despesas Ind. (VPD)" value={formatCurrency(totalVPD)} color="text-destructive" />
            <KPICard icon={TrendingUp} label="Margem Líquida Real" value={formatCurrency(lucroLiquidoConsolidado)} sub={formatPercent(margemLiquidaPercent)} color={lucroLiquidoConsolidado >= 0 ? 'text-success' : 'text-destructive'} />
            <KPICard icon={Users} label="Total Profissionais" value={String(totalProfissionais)} />
          </div>

          {barData.some(d => d.Faturamento > 0) && (
            <div className="grid lg:grid-cols-2 gap-4">
              <Card className="glass-card border-0">
                <CardContent className="pt-6">
                  <p className="eyebrow">Comparação</p>
                  <h4 className="mb-4 mt-1 font-heading text-base font-semibold">Faturamento vs custos por setor</h4>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={barData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                      <RTooltip formatter={(v: number) => formatCurrency(v)} />
                      <Bar dataKey="Faturamento" fill="#1E7BFF" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Custos" fill="#E74C3C" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Impostos" fill="#F39C12" radius={[4, 4, 0, 0]} />
                      <Legend />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="glass-card border-0">
                <CardContent className="pt-6">
                  <p className="eyebrow">Participação</p>
                  <h4 className="mb-4 mt-1 font-heading text-base font-semibold">Distribuição do faturamento</h4>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3}>
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <RTooltip formatter={(v: number) => formatCurrency(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          <Card className="glass-card border-0">
            <CardContent className="pt-6">
              <p className="eyebrow">Detalhamento</p>
              <h4 className="mb-4 mt-1 font-heading text-base font-semibold">Comparativo de setores</h4>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card/95 backdrop-blur">
                    <TableRow>
                      <TableHead className="text-xs">Setor</TableHead>
                      <TableHead className="text-xs">Tipo</TableHead>
                      <TableHead className="text-xs text-right">Faturamento</TableHead>
                      <TableHead className="text-xs text-right">Impostos</TableHead>
                      <TableHead className="text-xs text-right">Custos Pessoal</TableHead>
                      <TableHead className="text-xs text-right">Margem Líquida (R$)</TableHead>
                      <TableHead className="text-xs text-right">Margem Líquida (%)</TableHead>
                      <TableHead className="text-xs text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resumos.map(({ setor, resumo }) => (
                      <TableRow
                        key={setor.id}
                        title="Abrir o setor"
                        className="group cursor-pointer border-l-2 border-transparent transition-colors hover:border-l-[hsl(var(--dunatech-blue))] hover:bg-[hsl(var(--dunatech-blue))]/5"
                        onClick={() => setActiveSetor(setor.id)}
                      >
                        <TableCell className="text-sm font-medium group-hover:text-[hsl(var(--dunatech-blue))]">
                          {setor.nome}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {setor.tipo === 'operacional' ? 'Oper.' : 'Admin.'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatCurrency(resumo.faturamentoBruto)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatCurrency(resumo.impostos.total)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatCurrency(resumo.totalCustoPessoal)}</TableCell>
                        <TableCell className={`text-right font-mono text-xs ${resumo.lucroLiquidoReal >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {formatCurrency(resumo.lucroLiquidoReal)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatPercent(resumo.margemLiquidaPercent)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`text-[10px] ${getStatusColor(resumo.status)}`}>
                            {getStatusLabel(resumo.status)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/**
 * Indicador do topo. O rótulo vira eyebrow (some do caminho da leitura) e o
 * NÚMERO manda na hierarquia; o ícone ganha o tom do próprio indicador, então
 * dá pra varrer a linha inteira pela cor sem ler uma palavra.
 */
function KPICard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color?: string;
}) {
  const tom = color?.includes("success")
    ? { fg: "text-success", bg: "bg-success/10" }
    : color?.includes("destructive")
      ? { fg: "text-destructive", bg: "bg-destructive/10" }
      : color?.includes("warning")
        ? { fg: "text-warning", bg: "bg-warning/10" }
        : { fg: "text-[hsl(var(--dunatech-blue))]", bg: "bg-[hsl(var(--dunatech-blue))]/10" };

  return (
    <Card className="glass-card card-hover border-0">
      <CardContent className="px-4 pb-4 pt-4">
        <div className="mb-3 flex items-center gap-2">
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tom.bg}`}>
            <Icon className={`h-3.5 w-3.5 ${tom.fg}`} strokeWidth={2} />
          </span>
          <span className="eyebrow truncate text-[0.65rem]">{label}</span>
        </div>
        <p className={`font-mono-numbers text-[1.35rem] font-bold leading-none tracking-tight ${color || "text-foreground"}`}>
          {value}
        </p>
        {sub && (
          <p className="mt-2 inline-flex rounded-full bg-muted/70 px-1.5 py-0.5 font-mono-numbers text-[0.68rem] text-muted-foreground">
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  );
}