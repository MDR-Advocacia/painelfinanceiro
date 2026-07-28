// DP — Painel do Departamento Pessoal (visão gerencial).
// Tudo em português, responsivo, com (?) explicativo e DRILL-DOWN: clicar num
// número/fatia abre o Quadro de Pessoal já filtrado.
import { useEffect, useState } from "react";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Download, Info, Loader2,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Ajuda, TituloAjuda } from "@/components/dp/Ajuda";
import {
  type DpDashboard, REGIME_LABELS, exportApi, fmtBRL, fmtCompetencia,
  fmtCompetenciaLonga, relatoriosApi,
} from "@/services/dp";

const CORES = ["#1E7BFF", "#0A1940", "#7FB5FF", "#F39C12", "#27AE60", "#8B5CF6"];

/** filtro que o Quadro entende ao receber o drill-down */
export interface FiltroQuadro {
  regime?: string; status?: string; cc?: string; unidade?: string; busca?: string;
}

export default function DashboardDpTab({ onAbrirQuadro }: {
  onAbrirQuadro?: (f: FiltroQuadro, rotulo: string) => void;
}) {
  const [d, setD] = useState<DpDashboard | null>(null);

  useEffect(() => { relatoriosApi.dashboard().then(setD).catch(() => undefined); }, []);

  if (!d) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Carregando painel…
      </div>
    );
  }

  const drill = (f: FiltroQuadro, rotulo: string) => onAbrirQuadro?.(f, rotulo);
  const pieRegime = Object.entries(d.por_regime).map(([k, v]) => ({
    chave: k, name: REGIME_LABELS[k] || k, value: v,
  }));
  const custo = d.custo_competencia;
  const varia = d.variacao_custo;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Clique nos cartões e gráficos para abrir a lista de colaboradores já filtrada.
        </p>
        <Button size="sm" variant="outline" className="gap-1"
                onClick={() => exportApi.dashboard().catch((e) => toast.error(e.message))}>
          <Download className="h-3.5 w-3.5" /> Exportar (Excel)
        </Button>
      </div>

      {/* Alertas operacionais */}
      {d.alertas?.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {d.alertas.map((a, i) => (
            <div key={i} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
              a.tipo === "critico" ? "border-rose-300 bg-rose-50 text-rose-800"
                : a.tipo === "atencao" ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-sky-300 bg-sky-50 text-sky-800"}`}>
              {a.tipo === "info" ? <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              <span>{a.texto}</span>
            </div>
          ))}
        </div>
      )}

      {/* Indicadores principais */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi rotulo="Colaboradores ativos" valor={String(d.headcount)}
             ajuda="Quantas pessoas estão com contrato ativo hoje, somando todos os tipos de contrato."
             onClick={() => drill({ status: "ativo" }, "colaboradores ativos")} />
        <Kpi rotulo="Admitidos no mês" valor={String(d.admissoes_mes)} tom="text-emerald-600"
             ajuda="Quantas pessoas entraram neste mês (contando as importadas da planilha)." />
        <Kpi rotulo="Desligados no mês" valor={String(d.desligamentos_mes)} tom="text-rose-600"
             ajuda="Quantas pessoas saíram neste mês."
             onClick={() => drill({ status: "inativo" }, "desligados")} />
        <Kpi rotulo="Rotatividade do mês" valor={`${d.turnover_mes.toFixed(1)}%`}
             ajuda="Desligamentos do mês dividido pelo total de ativos. Também chamado de turnover." />
        <Kpi rotulo="Salário médio" valor={fmtBRL(d.folha_media_salario ?? 0)}
             ajuda="Média do salário bruto cadastrado dos colaboradores ativos." />
        <Kpi rotulo="Custo por pessoa" valor={fmtBRL(d.custo_medio_pessoa ?? 0)} destaque
             ajuda="Custo total da última folha calculada dividido pelo número de pessoas nela — inclui salário, benefícios, provisões e encargos." />
      </div>

      {/* Custo da última competência */}
      {custo && (
        <Card className="glass-card border-0">
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
              <TituloAjuda titulo={`Custo de ${fmtCompetenciaLonga(custo.mes)}`}
                           ajuda="Composição do custo total de pessoal do mês: o que é pago direto (folha), o que é reservado para 13º/férias/FGTS (provisões) e o INSS que a empresa paga (patronal)." />
              {varia && (
                <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  varia.percent >= 0 ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                  {varia.percent >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {Math.abs(varia.percent).toFixed(1)}% vs mês anterior
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Bloco rotulo="Pagamento direto" valor={fmtBRL(custo.folha)}
                   sub={d.participacao?.folha ? `${d.participacao.folha}% do custo` : ""} />
            <Bloco rotulo="Provisões" valor={fmtBRL(custo.provisoes)}
                   sub={d.participacao?.provisoes ? `${d.participacao.provisoes}% do custo` : ""} />
            <Bloco rotulo="INSS patronal" valor={fmtBRL(custo.patronal)}
                   sub={d.participacao?.patronal ? `${d.participacao.patronal}% do custo` : ""} />
            <Bloco rotulo="Custo total" valor={fmtBRL(custo.custo_total)} destaque
                   sub={`${custo.headcount} pessoas na folha`} />
          </CardContent>
        </Card>
      )}

      {/* Gráficos principais */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Painel titulo="Custo por mês"
                ajuda="Evolução do custo total de pessoal das competências já calculadas, separando pagamento direto, provisões e INSS patronal.">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={d.serie_custo.map((l) => ({ ...l, rotulo: fmtCompetencia(l.mes) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="rotulo" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)} mil`} />
              <RTooltip formatter={(v: number) => fmtBRL(v)} />
              <Bar dataKey="folha" name="Pagamento direto" stackId="c" fill="#1E7BFF" />
              <Bar dataKey="provisoes" name="Provisões" stackId="c" fill="#7FB5FF" />
              <Bar dataKey="patronal" name="INSS patronal" stackId="c" fill="#0A1940" radius={[4, 4, 0, 0]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </Painel>

        <Painel titulo="Entradas e saídas (12 meses)"
                ajuda="Quantas pessoas entraram e saíram em cada um dos últimos 12 meses.">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={d.serie_mov.map((l) => ({ ...l, rotulo: fmtCompetencia(l.mes) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="rotulo" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <RTooltip />
              <Line type="monotone" dataKey="admissoes" name="Entradas" stroke="#27AE60" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="desligamentos" name="Saídas" stroke="#E74C3C" strokeWidth={2} dot={false} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </LineChart>
          </ResponsiveContainer>
        </Painel>
      </div>

      {/* Custo por centro de custo */}
      {d.custo_por_cc?.length > 0 && (
        <Painel titulo="Custo por centro de custo"
                ajuda="Quanto cada setor/carteira custou na última folha calculada. Clique numa barra para ver as pessoas daquele centro de custo.">
          <ResponsiveContainer width="100%" height={Math.max(220, d.custo_por_cc.length * 26)}>
            <BarChart data={d.custo_por_cc} layout="vertical"
                      margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)} mil`} />
              <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} width={150} />
              <RTooltip formatter={(v: number, n) => [fmtBRL(v), n === "custo" ? "Custo total" : n]} />
              <Bar dataKey="custo" name="Custo total" fill="#1E7BFF" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Painel>
      )}

      {/* Distribuições */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Painel titulo="Por tipo de contrato"
                ajuda="Divisão dos colaboradores ativos entre Estagiário, CLT, Associado e PJ. Clique numa fatia para filtrar a lista.">
          <ResponsiveContainer width="100%" height={210}>
            <PieChart>
              <Pie data={pieRegime} dataKey="value" nameKey="name" cx="50%" cy="50%"
                   innerRadius={42} outerRadius={76} paddingAngle={3}
                   onClick={(x: any) => drill({ regime: x?.payload?.chave, status: "ativo" },
                                              REGIME_LABELS[x?.payload?.chave] || "")}
                   className="cursor-pointer">
                {pieRegime.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
              </Pie>
              <RTooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </Painel>

        <Painel titulo="Por unidade"
                ajuda="Onde as pessoas estão fisicamente alocadas. Clique para ver a lista da unidade.">
          <div className="space-y-1.5">
            {d.por_unidade?.map((u) => (
              <button key={u.nome} onClick={() => drill({ unidade: u.nome, status: "ativo" }, u.nome)}
                      className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted">
                <span className="truncate">{u.nome}</span>
                <span className="font-mono text-xs font-semibold">{u.quantidade}</span>
              </button>
            ))}
          </div>
        </Painel>

        <Painel titulo="Tempo de casa"
                ajuda="Há quanto tempo os colaboradores ativos estão no escritório, contando da data de admissão.">
          <div className="space-y-1.5">
            {d.tempo_casa?.map((f) => {
              const pct = d.headcount ? (f.quantidade / d.headcount) * 100 : 0;
              return (
                <div key={f.faixa} className="space-y-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <span>{f.faixa}</span>
                    <span className="font-mono font-semibold">{f.quantidade}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-[hsl(var(--dunatech-blue))]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Painel>
      </div>

      {/* Custo médio por tipo de contrato */}
      {d.custo_por_regime?.length > 0 && (
        <Painel titulo="Custo médio por tipo de contrato"
                ajuda="Quanto custa, em média, cada pessoa de cada tipo de contrato — já com benefícios, provisões e encargos.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-1.5 text-left font-medium">Tipo de contrato</th>
                  <th className="py-1.5 text-right font-medium">Pessoas</th>
                  <th className="py-1.5 text-right font-medium">Custo total</th>
                  <th className="py-1.5 text-right font-medium">Custo médio</th>
                </tr>
              </thead>
              <tbody>
                {d.custo_por_regime.map((r) => (
                  <tr key={r.regime} className="cursor-pointer border-b last:border-0 hover:bg-muted/50"
                      onClick={() => drill({ regime: r.regime }, REGIME_LABELS[r.regime] || r.regime)}>
                    <td className="py-1.5">{REGIME_LABELS[r.regime] || r.regime}</td>
                    <td className="py-1.5 text-right font-mono text-xs">{r.quantidade}</td>
                    <td className="py-1.5 text-right font-mono text-xs">{fmtBRL(r.custo)}</td>
                    <td className="py-1.5 text-right font-mono text-xs font-semibold">{fmtBRL(r.custo_medio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Painel>
      )}
    </div>
  );
}

function Kpi({ rotulo, valor, tom, destaque, ajuda, onClick }: {
  rotulo: string; valor: string; tom?: string; destaque?: boolean;
  ajuda: string; onClick?: () => void;
}) {
  return (
    <Card className={`glass-card border-0 ${destaque ? "ring-1 ring-[hsl(var(--dunatech-blue))]/30" : ""} ${onClick ? "cursor-pointer transition-transform hover:-translate-y-0.5" : ""}`}
          onClick={onClick}>
      <CardContent className="px-3 pb-3 pt-3 text-center">
        <div className={`font-mono text-base font-bold sm:text-lg ${tom || (destaque ? "text-[hsl(var(--dunatech-blue))]" : "text-foreground")}`}>
          {valor}
        </div>
        <div className="flex items-center justify-center gap-1 text-[10px] uppercase leading-tight tracking-wider text-muted-foreground">
          <span>{rotulo}</span>
          <Ajuda titulo={rotulo} texto={ajuda} />
        </div>
      </CardContent>
    </Card>
  );
}

function Painel({ titulo, ajuda, children }: {
  titulo: string; ajuda: string; children: React.ReactNode;
}) {
  return (
    <Card className="glass-card border-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          <TituloAjuda titulo={titulo} ajuda={ajuda} />
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Bloco({ rotulo, valor, sub, destaque }: {
  rotulo: string; valor: string; sub?: string; destaque?: boolean;
}) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${destaque ? "border-[hsl(var(--dunatech-blue))]/40 bg-[hsl(var(--dunatech-blue))]/5" : "bg-card/60"}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{rotulo}</div>
      <div className={`font-mono text-sm font-bold ${destaque ? "text-[hsl(var(--dunatech-blue))]" : ""}`}>{valor}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
