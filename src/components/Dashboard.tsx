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
import { DollarSign, TrendingUp, Users, AlertTriangle, Building2, Award, HelpCircle } from "lucide-react";
import { Kpi, PageHeader, SectionTitle, SegButtons, Vazio } from "@/components/Pagina";
import { TabelaRolavel } from "@/components/TabelaRolavel";

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
  
  // Vem do RESUMO, nao do bloco `pessoal` do setor. Contar direto do `pessoal`
  // lia a quantidade DIGITADA por cargo no painel antigo, que ninguem atualiza:
  // mostrava 171 em junho contra 173 ativos no DP, e ignorava tanto o espelho
  // do cadastro quanto o rateio do apoio. O resumo ja' resolve essa precedencia.
  const totalProfissionais = Math.round(
    resumos.reduce((a, r) => a + r.resumo.headcount, 0));

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
      <PageHeader
        eyebrow="Visão consolidada"
        titulo="Dashboard"
        descricao={<>
          {periodLabel} · visão {VIEW_MODE_LABELS[viewMode].toLowerCase()}
          {filtroSede !== "todas" && <> · {sedes.find((s) => s.id === filtroSede)?.nome}</>}
        </>}
        acoes={<>
          <SegButtons
            valor={viewMode}
            onChange={(m) => setViewMode(m as ViewMode)}
            opcoes={(['mensal', 'trimestral', 'semestral', 'anual'] as ViewMode[]).map((m) => ({ v: m, label: VIEW_MODE_LABELS[m] }))}
          />
          <div className="flex gap-2">
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
        </>}
      />

      {setores.length === 0 ? (
        <Vazio
          icone={Building2}
          titulo="Nenhum setor cadastrado"
          texto="Crie o primeiro setor pela barra lateral — o dashboard começa a somar assim que houver faturamento lançado."
        />
      ) : (
        <>
          {/* Grade alterada para 4 colunas em telas médias/grandes para comportar os 8 cards em 2 linhas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi icone={DollarSign} rotulo="Faturamento total" valor={formatCurrency(totalFaturamento)} />
            <Kpi icone={AlertTriangle} rotulo="Total de impostos" valor={formatCurrency(totalImpostos)} tom="atencao" corValor="text-warning" />
            <Kpi icone={Users} rotulo="Custos de pessoal" valor={formatCurrency(totalCustos)} tom="negativo" corValor="text-destructive" />
            <Kpi icone={Award} rotulo="Var. centro de custo" valor={formatCurrency(totalVariaveis)} tom="negativo" corValor="text-destructive" />

            <Kpi icone={DollarSign} rotulo="Lucro bruto" valor={formatCurrency(lucroBrutoConsolidado)}
                 sub={formatPercent(margemBrutaPercent)}
                 tom={lucroBrutoConsolidado >= 0 ? "positivo" : "negativo"}
                 corValor={lucroBrutoConsolidado >= 0 ? "text-success" : "text-destructive"} />
            <Kpi icone={Building2} rotulo="Despesas ind. (VPD)" valor={formatCurrency(totalVPD)} tom="negativo" corValor="text-destructive" />
            <Kpi icone={TrendingUp} rotulo="Margem líquida real" valor={formatCurrency(lucroLiquidoConsolidado)}
                 sub={formatPercent(margemLiquidaPercent)}
                 tom={lucroLiquidoConsolidado >= 0 ? "positivo" : "negativo"}
                 corValor={lucroLiquidoConsolidado >= 0 ? "text-success" : "text-destructive"} />
            <Kpi icone={Users} rotulo="Total de profissionais" valor={String(totalProfissionais)} />
          </div>

          {barData.some(d => d.Faturamento > 0) && (
            <div className="grid lg:grid-cols-2 gap-4">
              <Card className="glass-card border-0">
                <CardContent className="pt-6">
                  <SectionTitle eyebrow="Comparação" titulo="Faturamento vs custos por setor" />
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
                  <SectionTitle eyebrow="Participação" titulo="Distribuição do faturamento" />
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
              <SectionTitle eyebrow="Detalhamento" titulo="Comparativo de setores"
                            acoes={<span className="text-xs text-muted-foreground">clique numa linha para abrir o setor</span>} />
              <TabelaRolavel altura="max-h-[58vh]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur [&_th]:border-b">
                    <TableRow>
                      <TableHead className="text-xs">Setor</TableHead>
                      <TableHead className="text-xs">Tipo</TableHead>
                      <TableHead className="text-xs text-right">Faturamento</TableHead>
                      <TableHead className="text-xs text-right">Impostos</TableHead>
                      <TableHead className="text-xs text-right">
                        <span className="inline-flex items-center gap-1">
                          Pessoal direto
                          <span title={"Folha das pessoas que trabalham NESTA linha: salário, "
                                        + "benefícios, provisões e encargos. Não inclui o backoffice, "
                                        + "que aparece na coluna ao lado."} className="cursor-help">
                            <HelpCircle className="h-3 w-3 text-muted-foreground" />
                          </span>
                        </span>
                      </TableHead>
                      <TableHead className="text-xs text-right">
                        <span className="inline-flex items-center gap-1">
                          Backoffice
                          <span title={"RATEIO PROPORCIONAL das equipes de apoio (Administrativo e "
                                        + "TI), que servem todas as linhas e não faturam. "
                                        + "O critério é o NÚMERO DE COLABORADORES envolvidos: o custo "
                                        + "total do apoio é dividido pelo total de pessoas das linhas, e "
                                        + "cada linha leva a fatia proporcional à sua própria equipe. "
                                        + "Linha com o dobro de gente carrega o dobro de backoffice. "
                                        + "Sem esse rateio a margem de cada cliente apareceria melhor do "
                                        + "que é, porque o custo do apoio ficaria fora da conta."} className="cursor-help">
                            <HelpCircle className="h-3 w-3 text-muted-foreground" />
                          </span>
                        </span>
                      </TableHead>
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
                        <TableCell className="text-right font-mono text-xs">
                          {formatCurrency(resumo.custoPessoalDireto)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs"
                                   title={resumo.custoBackoffice > 0
                                     ? `${formatCurrency(resumo.custoBackoffice)} de apoio rateado por cabeça`
                                     : "Setor de apoio: o custo dele é rateado NAS outras linhas"}>
                          {resumo.custoBackoffice > 0
                            ? <span className="text-sky-700 dark:text-sky-300">
                                {formatCurrency(resumo.custoBackoffice)}
                              </span>
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-semibold">
                          {formatCurrency(resumo.totalCustoPessoal)}
                        </TableCell>
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
              </TabelaRolavel>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

