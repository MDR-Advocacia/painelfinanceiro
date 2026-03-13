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

const CHART_COLORS = ["#1F4E78", "#27AE60", "#F39C12", "#E74C3C", "#8B5CF6", "#06B6D4"];

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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-heading text-2xl font-bold text-foreground">Dashboard Consolidado</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {periodLabel} — Visão {VIEW_MODE_LABELS[viewMode].toLowerCase()}
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
        <Card>
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
              <Card>
                <CardContent className="pt-6">
                  <h4 className="font-heading text-sm font-semibold mb-4">Faturamento vs Custos por Setor</h4>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={barData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 90%)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                      <RTooltip formatter={(v: number) => formatCurrency(v)} />
                      <Bar dataKey="Faturamento" fill="#1F4E78" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Custos" fill="#E74C3C" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Impostos" fill="#F39C12" radius={[4, 4, 0, 0]} />
                      <Legend />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <h4 className="font-heading text-sm font-semibold mb-4">Distribuição de Faturamento</h4>
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

          <Card>
            <CardContent className="pt-6">
              <h4 className="font-heading text-sm font-semibold mb-4">Comparativo de Setores</h4>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
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
                      <TableRow key={setor.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setActiveSetor(setor.id)}>
                        <TableCell className="font-medium text-sm">{setor.nome}</TableCell>
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

function KPICard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon className="w-4 h-4 text-primary" />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className={`font-mono text-lg font-bold ${color || 'text-foreground'}`}>{value}</p>
        {sub && <p className="text-xs font-mono text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}