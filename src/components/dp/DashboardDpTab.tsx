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
  type DpDashboard, type DpPremiacoes, REGIME_LABELS, exportApi, fmtBRL, fmtCompetencia,
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
  // o painel nasce na ULTIMA FOLHA FECHADA: o mes em curso ainda nao tem
  // faltas, premios e acertos lancados, e mostra um custo pela metade
  const [escopo, setEscopo] = useState<"fechadas" | "todas">("fechadas");

  useEffect(() => {
    relatoriosApi.dashboard(escopo).then(setD).catch(() => undefined);
  }, [escopo]);

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
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold">Base do painel:</span>
          {d.competencia_base ? (
            <span className="rounded bg-card px-2 py-0.5 font-medium">
              {d.competencia_base.mes_nome} {d.competencia_base.ano}
              <span className={`ml-1.5 rounded px-1 py-px text-[0.62rem] uppercase ${
                d.competencia_base.status === "fechada"
                  ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
                {d.competencia_base.status === "fechada" ? "fechada" : "em aberto"}
              </span>
            </span>
          ) : <span className="text-muted-foreground">nenhuma competência</span>}
          <Ajuda texto={
            "O painel é montado pela última folha FECHADA. A folha do mês em curso ainda " +
            "não tem todas as faltas, prêmios e acertos lançados — usá-la como base mostraria " +
            "um custo pela metade. Troque para “inclui a aberta” quando quiser acompanhar o " +
            "mês em andamento, sabendo que ele ainda vai mudar."
          } />
        </div>
        <div className="flex overflow-hidden rounded-md border">
          {([["fechadas", "Só folhas fechadas"], ["todas", "Inclui a aberta"]] as const).map(([v, rot]) => (
            <button key={v} onClick={() => setEscopo(v)}
                    className={`px-2.5 py-1 text-[0.7rem] transition-colors ${
                      escopo === v ? "bg-primary text-primary-foreground"
                                   : "bg-card hover:bg-muted"}`}>
              {rot}
            </button>
          ))}
        </div>
      </div>

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

      {/* Colaboradores e rotatividade por mês */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Painel titulo="Colaboradores por mês"
                ajuda="Quantas pessoas estavam na folha em cada competência calculada.">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={d.serie_custo.map((l) => ({ ...l, rotulo: fmtCompetencia(l.mes) }))}
                      layout="vertical" margin={{ left: 4, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis type="category" dataKey="rotulo" tick={{ fontSize: 10 }} width={54} />
              <RTooltip />
              <Bar dataKey="headcount" name="Colaboradores" fill="#1E7BFF" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Painel>

        <Painel titulo="Rotatividade por mês (%)"
                ajuda="Percentual de desligamentos sobre o total de pessoas em cada mês — o famoso turnover.">
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={d.serie_custo.map((l) => ({ ...l, rotulo: fmtCompetencia(l.mes) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="rotulo" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
              <RTooltip formatter={(v: number) => `${v.toFixed(2)}%`} />
              <Line type="monotone" dataKey="turnover" name="Rotatividade" stroke="#E74C3C"
                    strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Painel>
      </div>

      {/* Evolução mensal consolidada */}
      <Painel titulo="Evolução mensal"
              ajuda="Tabela consolidada por competência: pessoas, movimentação, rotatividade, custo total e por CLT, provisões, INSS patronal e FGTS acumulado.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="py-1.5 text-left font-medium">Mês</th>
                <th className="py-1.5 text-right font-medium">Pessoas</th>
                <th className="py-1.5 text-right font-medium">Entradas</th>
                <th className="py-1.5 text-right font-medium">Saídas</th>
                <th className="py-1.5 text-right font-medium">Rotativ.</th>
                <th className="py-1.5 text-right font-medium">Custo total</th>
                <th className="py-1.5 text-right font-medium">Custo CLT</th>
                <th className="py-1.5 text-right font-medium">Provisões</th>
                <th className="py-1.5 text-right font-medium">Patronal</th>
                <th className="py-1.5 text-right font-medium">FGTS acum.</th>
              </tr>
            </thead>
            <tbody>
              {d.serie_custo.map((l) => (
                <tr key={l.mes} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="py-1.5 font-medium">{fmtCompetencia(l.mes)}</td>
                  <td className="py-1.5 text-right font-mono text-xs">{l.headcount}</td>
                  <td className="py-1.5 text-right font-mono text-xs text-emerald-700">{l.admissoes ?? 0}</td>
                  <td className="py-1.5 text-right font-mono text-xs text-rose-700">{l.desligamentos ?? 0}</td>
                  <td className="py-1.5 text-right font-mono text-xs">{(l.turnover ?? 0).toFixed(2)}%</td>
                  <td className="py-1.5 text-right font-mono text-xs font-semibold">{fmtBRL(l.custo_total)}</td>
                  <td className="py-1.5 text-right font-mono text-xs">{fmtBRL(l.custo_clt ?? 0)}</td>
                  <td className="py-1.5 text-right font-mono text-xs">{fmtBRL(l.provisoes)}</td>
                  <td className="py-1.5 text-right font-mono text-xs">{fmtBRL(l.patronal)}</td>
                  <td className="py-1.5 text-right font-mono text-xs text-muted-foreground">{fmtBRL(l.fgts_acumulado ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Painel>

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

      {/* Custo médio por cargo */}
      {d.custo_por_cargo?.length > 0 && (
        <Painel titulo="Custo por cargo"
                ajuda="Custo MÉDIO é quanto custa cada pessoa daquele cargo — serve pra dimensionar uma contratação. Custo TOTAL é quanto o cargo inteiro pesa no mês (média × pessoas) — é ele que mostra onde o dinheiro está de fato. Um cargo caro com uma pessoa pesa menos que um cargo barato com vinte. Os dois já incluem benefícios, provisões e encargos.">
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-1.5 text-left font-medium">Cargo</th>
                  <th className="py-1.5 text-left font-medium">Contrato</th>
                  <th className="py-1.5 text-right font-medium">Pessoas</th>
                  <th className="py-1.5 text-right font-medium">Salário médio</th>
                  <th className="py-1.5 text-right font-medium">Custo médio</th>
                  <th className="py-1.5 text-right font-medium">Custo total</th>
                  <th className="py-1.5 text-right font-medium">% da folha</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // ordenado pelo TOTAL: a pergunta que a tabela responde é "onde
                  // está o dinheiro", e não "qual cargo é o mais caro por cabeça"
                  const linhas = [...d.custo_por_cargo].sort((a, b) => (b.custo ?? 0) - (a.custo ?? 0));
                  const somaFolha = linhas.reduce((t, c) => t + (c.custo ?? 0), 0);
                  return linhas.map((c, i) => {
                    const fatia = somaFolha > 0 ? ((c.custo ?? 0) / somaFolha) * 100 : 0;
                    return (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="max-w-[220px] truncate py-1.5">{c.cargo}</td>
                        <td className="py-1.5 text-xs text-muted-foreground">{REGIME_LABELS[c.regime] || c.regime}</td>
                        <td className="py-1.5 text-right font-mono text-xs">{c.quantidade}</td>
                        <td className="py-1.5 text-right font-mono text-xs">{fmtBRL(c.salario_medio)}</td>
                        <td className="py-1.5 text-right font-mono text-xs">{fmtBRL(c.custo_medio)}</td>
                        <td className="py-1.5 text-right font-mono text-xs font-semibold">{fmtBRL(c.custo ?? 0)}</td>
                        <td className="py-1.5 text-right font-mono text-xs text-muted-foreground">
                          {fatia.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
              <tfoot className="sticky bottom-0 bg-card">
                <tr className="border-t-2 text-xs font-semibold">
                  <td className="py-1.5" colSpan={2}>Total</td>
                  <td className="py-1.5 text-right font-mono">
                    {d.custo_por_cargo.reduce((t, c) => t + (c.quantidade ?? 0), 0)}
                  </td>
                  <td />
                  <td />
                  <td className="py-1.5 text-right font-mono">
                    {fmtBRL(d.custo_por_cargo.reduce((t, c) => t + (c.custo ?? 0), 0))}
                  </td>
                  <td className="py-1.5 text-right font-mono text-muted-foreground">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Painel>
      )}

      {/* Premiações pagas por centro de custo */}
      {d.premiacoes && <PremiacoesPainel dados={d.premiacoes} drill={drill} />}

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


/* ─────────────── PREMIAÇÕES POR CENTRO DE CUSTO ─────────────── */

function PremiacoesPainel({ dados, drill }: {
  dados: DpPremiacoes;
  drill: (f: FiltroQuadro, rotulo: string) => void;
}) {
  const [visao, setVisao] = useState<"mes" | "ano">("mes");
  const linhas = visao === "mes" ? dados.mes : dados.ano;
  const total = visao === "mes" ? dados.total_mes : dados.total_ano;
  const pessoas = visao === "mes" ? dados.pessoas_mes : dados.pessoas_ano;
  const rotulo = visao === "mes"
    ? `competência ${dados.competencia ?? "—"}`
    : `ano de ${dados.ano_ref ?? "—"}`;

  return (
    <Card className="glass-card border-0">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm">
            <TituloAjuda
              titulo="Premiações pagas por centro de custo"
              ajuda="Premiação é o único valor da folha que é decisão de gestão — não vem de regra nem de cálculo. Este quadro mostra quanto cada centro de custo distribuiu, para quantas pessoas e qual o valor médio, para dar visibilidade a essa escolha." />
          </CardTitle>
          <div className="flex rounded-md border p-0.5 text-xs">
            <button onClick={() => setVisao("mes")}
                    className={`rounded px-2 py-0.5 transition-colors ${visao === "mes"
                      ? "bg-[hsl(var(--dunatech-blue))] text-white" : "text-muted-foreground hover:text-foreground"}`}>
              No mês
            </button>
            <button onClick={() => setVisao("ano")}
                    className={`rounded px-2 py-0.5 transition-colors ${visao === "ano"
                      ? "bg-[hsl(var(--dunatech-blue))] text-white" : "text-muted-foreground hover:text-foreground"}`}>
              No ano
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {total === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma premiação lançada {visao === "mes" ? `na ${rotulo}` : `em ${dados.ano_ref ?? "—"}`}.
            <br />
            <span className="text-xs">
              As premiações entram pela Folha, no menu de ocorrências (⋮) de cada pessoa.
            </span>
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Bloco rotulo="Total premiado" valor={fmtBRL(total)} sub={rotulo} destaque />
              <Bloco rotulo="Pessoas premiadas" valor={String(pessoas)}
                     sub={`${linhas.length} centro(s) de custo`} />
              <Bloco rotulo="Prêmio médio" valor={fmtBRL(pessoas ? total / pessoas : 0)}
                     sub="por pessoa premiada" />
            </div>

            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={linhas.slice(0, 10)} layout="vertical"
                          margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.25} />
                  <XAxis type="number" tick={{ fontSize: 10 }}
                         tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
                  <YAxis type="category" dataKey="nome" width={150} tick={{ fontSize: 10 }} />
                  <RTooltip formatter={(v: number, k) => [k === "valor" ? fmtBRL(v) : v,
                                                          k === "valor" ? "Premiações" : "Pessoas"]} />
                  <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                    {linhas.slice(0, 10).map((_, i) => (
                      <Cell key={i} fill={CORES[i % CORES.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-1.5 text-left font-medium">Centro de custo</th>
                    <th className="py-1.5 text-right font-medium">Premiado</th>
                    <th className="py-1.5 text-right font-medium">Pessoas</th>
                    <th className="py-1.5 text-right font-medium">Prêmio médio</th>
                    <th className="py-1.5 text-right font-medium">% do total</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.nome}
                        className={`border-b last:border-0 ${l.cc_id ? "cursor-pointer hover:bg-muted/50" : ""}`}
                        title={l.cc_id ? "Ver as pessoas deste centro de custo" : ""}
                        onClick={() => l.cc_id && drill({ cc: l.cc_id, status: "ativo" }, l.nome)}>
                      <td className="py-1.5">{l.nome}</td>
                      <td className="py-1.5 text-right font-mono text-xs font-semibold">{fmtBRL(l.valor)}</td>
                      <td className="py-1.5 text-right font-mono text-xs">{l.pessoas}</td>
                      <td className="py-1.5 text-right font-mono text-xs">{fmtBRL(l.media)}</td>
                      <td className="py-1.5 text-right font-mono text-xs text-muted-foreground">
                        {l.percentual.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {dados.top.length > 0 && (
              <details className="rounded-lg border bg-muted/20 p-2 text-xs">
                <summary className="cursor-pointer font-medium">
                  Quem mais recebeu prêmio em {dados.ano_ref} ({dados.top.length} pessoas)
                </summary>
                <ul className="mt-2 space-y-1">
                  {dados.top.map((t, i) => (
                    <li key={i} className="flex items-baseline gap-2">
                      <span className="w-4 text-right font-mono text-muted-foreground">{i + 1}.</span>
                      <span className="truncate">{t.nome}</span>
                      <span className="text-muted-foreground">· {t.centro_custo}</span>
                      <span className="ml-auto shrink-0 font-mono font-semibold">{fmtBRL(t.valor)}</span>
                      <span className="shrink-0 text-muted-foreground">
                        em {t.meses} {t.meses === 1 ? "mês" : "meses"}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {dados.serie.length > 1 && (
              <div className="h-[160px] w-full">
                <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                  Premiações mês a mês
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dados.serie} margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="mes" tickFormatter={fmtCompetencia} tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <RTooltip formatter={(v: number) => fmtBRL(v)}
                              labelFormatter={(l) => fmtCompetenciaLonga(String(l))} />
                    <Line type="monotone" dataKey="valor" stroke="#27AE60" strokeWidth={2}
                          dot={{ r: 3 }} name="Premiações" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
