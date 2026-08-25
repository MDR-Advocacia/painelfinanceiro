import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Award, Building2, ChevronDown, DollarSign, TrendingUp, Users,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";

import { useApp } from "@/contexts/AppContext";
import { PeriodSelector } from "@/components/PeriodSelector";
import { Kpi, PageHeader, SectionTitle, SegButtons, Vazio } from "@/components/Pagina";
import { TabelaRolavel } from "@/components/TabelaRolavel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { abrirDetalheEquipe, estruturaApi, type EfAlocacao, type EfEstrutura } from "@/services/estrutura";
import { MONTH_NAMES } from "@/types/sector";
import type { ViewMode } from "@/types/sector";
import {
  formatCurrency, formatPercent, getMonthsForPeriod, getStatusColor, getStatusLabel,
} from "@/utils/calculations";

const CHART_COLORS = ["#1E7BFF", "#0A1940", "#7FB5FF", "#27AE60", "#F39C12", "#E74C3C"];

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  mensal: "Mensal",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

type StatusMargem = "excelente" | "saudavel" | "atencao" | "critico";

interface EquipeResumo {
  id: string;
  nome: string;
  grupo: string;
  faturamento: number;
  descontos: number;
  impostos: number;
  custoPessoal: number;
  pessoasPorMes: Record<string, number>;
  profissionais: number;
  custoVPD: number;
  lucroBruto: number;
  margemLiquida: number;
  margemLiquidaPercent: number;
  status: StatusMargem;
}

function statusDaMargem(percentual: number): StatusMargem {
  if (percentual > 25) return "excelente";
  if (percentual > 15) return "saudavel";
  if (percentual > 5) return "atencao";
  return "critico";
}

function competenciaEsperada(periodo: string) {
  const [ano, mes] = periodo.split("-");
  return `${mes}/${ano}`;
}

export function Dashboard() {
  const {
    sedes, periodoAtivo, setPeriodoAtivo, viewMode, setViewMode, currentVpdValor, setView,
  } = useApp();
  const [filtroSede, setFiltroSede] = useState("todas");
  // Lista vazia representa "todas". Assim novas equipes entram automaticamente.
  const [equipesSelecionadas, setEquipesSelecionadas] = useState<string[]>([]);
  const [estruturas, setEstruturas] = useState<EfEstrutura[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const meses = useMemo(
    () => getMonthsForPeriod(periodoAtivo, viewMode),
    [periodoAtivo, viewMode],
  );

  useEffect(() => {
    let vigente = true;
    setCarregando(true);
    setErro(null);

    Promise.all(meses.map((mes) => estruturaApi.carregar(mes)))
      .then((respostas) => {
        if (!vigente) return;
        // Evita que uma competência futura sem folha repita, por fallback, o
        // custo do último mês fechado dentro de uma visão trimestral/anual.
        const validas = respostas.filter((estrutura, indice) => {
          const mes = meses[indice];
          const temReceita = estrutura.periodos?.includes(mes) ?? false;
          const temFolhaDoMes = estrutura.competencia_custo === competenciaEsperada(mes);
          return temReceita || temFolhaDoMes;
        });
        setEstruturas(validas);
      })
      .catch((e) => {
        if (vigente) setErro(e instanceof Error ? e.message : "Não foi possível carregar o dashboard.");
      })
      .finally(() => { if (vigente) setCarregando(false); });

    return () => { vigente = false; };
  }, [meses]);

  const equipesDisponiveis = useMemo(() => {
    const mapa = new Map<string, { id: string; nome: string; grupo: string }>();
    const registrar = (a: EfAlocacao) => mapa.set(a.equipe_id, {
      id: a.equipe_id, nome: a.equipe, grupo: a.grupo,
    });
    for (const estrutura of estruturas) {
      for (const centro of [...estrutura.centros, ...estrutura.infraestrutura]) {
        centro.alocacoes.forEach(registrar);
        centro.linhas.forEach((linha) => linha.alocacoes.forEach(registrar));
      }
    }
    return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [estruturas]);

  const idsSelecionados = useMemo(
    () => new Set(equipesSelecionadas.length ? equipesSelecionadas : equipesDisponiveis.map((e) => e.id)),
    [equipesSelecionadas, equipesDisponiveis],
  );

  const resumos = useMemo<EquipeResumo[]>(() => {
    type Parcial = Omit<EquipeResumo, "profissionais" | "custoVPD" | "lucroBruto" | "margemLiquida" | "margemLiquidaPercent" | "status">;
    const mapa = new Map<string, Parcial>();
    const obter = (a: EfAlocacao) => {
      let equipe = mapa.get(a.equipe_id);
      if (!equipe) {
        equipe = {
          id: a.equipe_id, nome: a.equipe, grupo: a.grupo,
          faturamento: 0, descontos: 0, impostos: 0, custoPessoal: 0,
          pessoasPorMes: {},
        };
        mapa.set(a.equipe_id, equipe);
      }
      return equipe;
    };

    for (const estrutura of estruturas) {
      const mes = estrutura.periodo || periodoAtivo;
      for (const centro of [...estrutura.centros, ...estrutura.infraestrutura]) {
        for (const linha of centro.linhas) {
          if (filtroSede !== "todas" && linha.sede_id !== filtroSede) continue;
          const denominador = linha.soma_percentual
            || linha.alocacoes.reduce((soma, a) => soma + (a.percentual || 0), 0);
          for (const alocacao of linha.alocacoes) {
            if (!idsSelecionados.has(alocacao.equipe_id)) continue;
            const equipe = obter(alocacao);
            const participacao = denominador > 0 ? (alocacao.percentual || 0) / denominador : 0;
            equipe.faturamento += linha.receita_bruta * participacao;
            equipe.descontos += linha.descontos * participacao;
            equipe.impostos += linha.impostos * participacao;
            equipe.custoPessoal += alocacao.custo_total || 0;
            equipe.pessoasPorMes[mes] = Math.max(equipe.pessoasPorMes[mes] || 0, alocacao.pessoas || 0);
          }
        }

        for (const alocacao of centro.alocacoes) {
          if (!idsSelecionados.has(alocacao.equipe_id)) continue;
          let fatorSede = 1;
          if (filtroSede !== "todas") {
            if (centro.tipo === "infraestrutura") {
              fatorSede = (centro.sedes.find((s) => s.sede_id === filtroSede)?.percentual || 0) / 100;
            } else {
              const sedesDoCentro = new Set(centro.sedes.map((s) => s.sede_id));
              fatorSede = sedesDoCentro.has(filtroSede) ? 1 / Math.max(sedesDoCentro.size, 1) : 0;
            }
          }
          if (!fatorSede) continue;
          const equipe = obter(alocacao);
          equipe.custoPessoal += (alocacao.custo_total || 0) * fatorSede;
          equipe.pessoasPorMes[mes] = Math.max(
            equipe.pessoasPorMes[mes] || 0,
            (alocacao.pessoas || 0) * fatorSede,
          );
        }
      }
    }

    const ultimoMes = estruturas.map((e) => e.periodo).filter(Boolean).sort().at(-1) || periodoAtivo;
    return [...mapa.values()].map((equipe) => {
      const profissionais = equipe.pessoasPorMes[ultimoMes] || 0;
      const custoVPD = Object.values(equipe.pessoasPorMes)
        .reduce((soma, pessoas) => soma + pessoas * currentVpdValor, 0);
      const lucroBruto = equipe.faturamento - equipe.descontos - equipe.impostos - equipe.custoPessoal;
      const margemLiquida = lucroBruto - custoVPD;
      const margemLiquidaPercent = equipe.faturamento > 0 ? (margemLiquida / equipe.faturamento) * 100 : 0;
      return {
        ...equipe, profissionais, custoVPD, lucroBruto, margemLiquida,
        margemLiquidaPercent, status: statusDaMargem(margemLiquidaPercent),
      };
    }).sort((a, b) => b.faturamento - a.faturamento || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [estruturas, filtroSede, idsSelecionados, currentVpdValor, periodoAtivo]);

  const totalFaturamento = resumos.reduce((s, r) => s + r.faturamento, 0);
  const totalDescontos = resumos.reduce((s, r) => s + r.descontos, 0);
  const totalImpostos = resumos.reduce((s, r) => s + r.impostos, 0);
  const totalCustos = resumos.reduce((s, r) => s + r.custoPessoal, 0);
  const totalVPD = resumos.reduce((s, r) => s + r.custoVPD, 0);
  const totalProfissionais = Math.round(resumos.reduce((s, r) => s + r.profissionais, 0));
  const lucroBrutoConsolidado = totalFaturamento - totalDescontos - totalImpostos - totalCustos;
  const lucroLiquidoConsolidado = lucroBrutoConsolidado - totalVPD;
  const margemBrutaPercent = totalFaturamento > 0 ? (lucroBrutoConsolidado / totalFaturamento) * 100 : 0;
  const margemLiquidaPercent = totalFaturamento > 0 ? (lucroLiquidoConsolidado / totalFaturamento) * 100 : 0;

  const [year, month] = periodoAtivo.split("-").map(Number);
  const periodLabel = viewMode === "mensal" ? `${MONTH_NAMES[month - 1]} ${year}`
    : viewMode === "trimestral" ? `${Math.ceil(month / 3)}º Tri ${year}`
      : viewMode === "semestral" ? `${month <= 6 ? "1º" : "2º"} Sem ${year}` : `${year}`;

  const filtroEquipeLabel = equipesSelecionadas.length === 0 ? "Todas as equipes"
    : equipesSelecionadas.length === 1
      ? equipesDisponiveis.find((e) => e.id === equipesSelecionadas[0])?.nome || "1 equipe"
      : `${equipesSelecionadas.length} equipes`;

  const alternarEquipe = (id: string, marcada: boolean) => {
    const todos = equipesDisponiveis.map((e) => e.id);
    const atuais = equipesSelecionadas.length ? new Set(equipesSelecionadas) : new Set(todos);
    if (marcada) atuais.add(id); else atuais.delete(id);
    const proxima = todos.filter((equipeId) => atuais.has(equipeId));
    setEquipesSelecionadas(proxima.length === todos.length ? [] : proxima);
  };

  const barData = resumos.map((r) => ({
    name: r.nome.length > 15 ? `${r.nome.slice(0, 15)}…` : r.nome,
    Faturamento: r.faturamento, Custos: r.custoPessoal, Impostos: r.impostos,
  }));
  const pieData = resumos.filter((r) => r.faturamento > 0).map((r) => ({ name: r.nome, value: r.faturamento }));
  const custoParcial = estruturas.some((e) => e.custo_parcial);
  const competenciaCusto = estruturas.map((e) => e.competencia_custo).filter(Boolean).sort().at(-1);

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        eyebrow="Visão consolidada"
        titulo="Dashboard"
        descricao={<>
          {periodLabel} · visão {VIEW_MODE_LABELS[viewMode].toLowerCase()} por equipe
          {filtroSede !== "todas" && <> · {sedes.find((s) => s.id === filtroSede)?.nome}</>}
        </>}
        acoes={<>
          <SegButtons
            valor={viewMode}
            onChange={(m) => setViewMode(m as ViewMode)}
            opcoes={(Object.keys(VIEW_MODE_LABELS) as ViewMode[]).map((m) => ({ v: m, label: VIEW_MODE_LABELS[m] }))}
          />
          <Select value={filtroSede} onValueChange={setFiltroSede}>
            <SelectTrigger className="h-9 w-[140px] text-xs"><SelectValue placeholder="Todas as Sedes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as Sedes</SelectItem>
              {sedes.map((sede) => <SelectItem key={sede.id} value={sede.id}>{sede.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="w-[190px] justify-between px-3 text-xs font-normal">
                <span className="truncate">{filtroEquipeLabel}</span><ChevronDown className="ml-2 h-4 w-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[430px] w-[310px] overflow-y-auto">
              <DropdownMenuLabel>Equipes no dashboard</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={equipesSelecionadas.length === 0}
                onCheckedChange={() => setEquipesSelecionadas([])}
                onSelect={(e) => e.preventDefault()}
              >Todas as equipes</DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              {equipesDisponiveis.map((equipe) => (
                <DropdownMenuCheckboxItem
                  key={equipe.id}
                  checked={equipesSelecionadas.length === 0 || equipesSelecionadas.includes(equipe.id)}
                  onCheckedChange={(marcada) => alternarEquipe(equipe.id, marcada === true)}
                  onSelect={(e) => e.preventDefault()}
                ><span className="truncate">{equipe.nome}</span></DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <PeriodSelector value={periodoAtivo} onChange={setPeriodoAtivo} />
        </>}
      />

      {erro ? (
        <Vazio icone={AlertTriangle} titulo="Não foi possível carregar os dados" texto={erro} />
      ) : carregando && estruturas.length === 0 ? (
        <Vazio icone={Building2} titulo="Carregando dashboard" texto="Consolidando faturamento e folha por equipe…" />
      ) : resumos.length === 0 ? (
        <Vazio icone={Users} titulo="Nenhuma equipe neste recorte" texto="Altere as equipes, a sede ou o período selecionado." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Kpi icone={DollarSign} rotulo="Faturamento total" valor={formatCurrency(totalFaturamento)} />
            <Kpi icone={AlertTriangle} rotulo="Total de impostos" valor={formatCurrency(totalImpostos)} tom="atencao" corValor="text-warning" />
            <Kpi
              icone={Users} rotulo="Custos de pessoal" valor={formatCurrency(totalCustos)}
              sub={competenciaCusto ? `Folha ${competenciaCusto}${custoParcial ? " · em andamento" : ""}` : undefined}
              tom="negativo" corValor="text-destructive"
            />
            <Kpi icone={Award} rotulo="Var. centro de custo" valor={formatCurrency(0)} tom="negativo" corValor="text-destructive" />
            <Kpi
              icone={DollarSign} rotulo="Lucro bruto" valor={formatCurrency(lucroBrutoConsolidado)}
              sub={formatPercent(margemBrutaPercent)} tom={lucroBrutoConsolidado >= 0 ? "positivo" : "negativo"}
              corValor={lucroBrutoConsolidado >= 0 ? "text-success" : "text-destructive"}
            />
            <Kpi icone={Building2} rotulo="Despesas ind. (VPD)" valor={formatCurrency(totalVPD)} tom="negativo" corValor="text-destructive" />
            <Kpi
              icone={TrendingUp} rotulo="Margem líquida real" valor={formatCurrency(lucroLiquidoConsolidado)}
              sub={formatPercent(margemLiquidaPercent)} tom={lucroLiquidoConsolidado >= 0 ? "positivo" : "negativo"}
              corValor={lucroLiquidoConsolidado >= 0 ? "text-success" : "text-destructive"}
            />
            <Kpi icone={Users} rotulo="Total de profissionais" valor={String(totalProfissionais)} />
          </div>

          {barData.some((d) => d.Faturamento > 0) && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="glass-card border-0">
                <CardContent className="pt-6">
                  <SectionTitle eyebrow="Comparação" titulo="Faturamento vs custos por equipe" />
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={barData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
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
                        {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
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
              <SectionTitle
                eyebrow="Detalhamento" titulo="Comparativo de equipes"
                acoes={<span className="text-xs text-muted-foreground">clique numa linha para abrir a equipe</span>}
              />
              <TabelaRolavel altura="max-h-[58vh]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur [&_th]:border-b">
                    <TableRow>
                      <TableHead className="text-xs">Equipe</TableHead>
                      <TableHead className="text-xs">Grupo</TableHead>
                      <TableHead className="text-right text-xs">Faturamento</TableHead>
                      <TableHead className="text-right text-xs">Impostos</TableHead>
                      <TableHead className="text-right text-xs">Profissionais</TableHead>
                      <TableHead className="text-right text-xs">Custos pessoal</TableHead>
                      <TableHead className="text-right text-xs">VPD</TableHead>
                      <TableHead className="text-right text-xs">Margem líquida (R$)</TableHead>
                      <TableHead className="text-right text-xs">Margem líquida (%)</TableHead>
                      <TableHead className="text-center text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resumos.map((resumo) => (
                      <TableRow
                        key={resumo.id} title="Abrir a equipe"
                        className="group cursor-pointer border-l-2 border-transparent transition-colors hover:border-l-[hsl(var(--dunatech-blue))] hover:bg-[hsl(var(--dunatech-blue))]/5"
                        onClick={() => abrirDetalheEquipe(resumo.id, setView)}
                      >
                        <TableCell className="text-sm font-medium group-hover:text-[hsl(var(--dunatech-blue))]">{resumo.nome}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{resumo.grupo}</Badge></TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatCurrency(resumo.faturamento)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatCurrency(resumo.impostos)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{Math.round(resumo.profissionais)}</TableCell>
                        <TableCell className="text-right font-mono text-xs font-semibold">{formatCurrency(resumo.custoPessoal)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatCurrency(resumo.custoVPD)}</TableCell>
                        <TableCell className={`text-right font-mono text-xs ${resumo.margemLiquida >= 0 ? "text-success" : "text-destructive"}`}>
                          {formatCurrency(resumo.margemLiquida)}
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
