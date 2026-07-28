// DP — F4: Dashboard do Departamento Pessoal.
// KPIs (headcount, movimentação, turnover, custo) + série de custo por
// competência + movimentação mensal + composição por regime.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type DpDashboard, REGIME_LABELS, fmtBRL, relatoriosApi } from "@/services/dp";

const CORES = ["#1E7BFF", "#0A1940", "#7FB5FF", "#F39C12"];

export default function DashboardDpTab() {
  const [d, setD] = useState<DpDashboard | null>(null);

  useEffect(() => {
    relatoriosApi.dashboard().then(setD).catch(() => undefined);
  }, []);

  if (!d) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Carregando dashboard…
      </div>
    );
  }

  const pieData = Object.entries(d.por_regime).map(([k, v]) => ({
    name: REGIME_LABELS[k] || k, value: v,
  }));
  const custo = d.custo_competencia;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard rotulo="Headcount ativo" valor={String(d.headcount)} />
        <KpiCard rotulo="Admissões (mês)" valor={String(d.admissoes_mes)} tom="text-emerald-600" />
        <KpiCard rotulo="Desligamentos (mês)" valor={String(d.desligamentos_mes)} tom="text-rose-600" />
        <KpiCard rotulo="Turnover (mês)" valor={`${d.turnover_mes.toFixed(1)}%`} />
        <KpiCard rotulo={`Custo ${custo ? custo.mes : "—"}`} valor={custo ? fmtBRL(custo.custo_total) : "—"} destaque />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="glass-card border-0">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Custo por competência</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={d.serie_custo}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <RTooltip formatter={(v: number) => fmtBRL(v)} />
                <Bar dataKey="folha" name="Folha" stackId="c" fill="#1E7BFF" />
                <Bar dataKey="provisoes" name="Provisões" stackId="c" fill="#7FB5FF" />
                <Bar dataKey="patronal" name="Patronal" stackId="c" fill="#0A1940" radius={[4, 4, 0, 0]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass-card border-0">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Movimentação (12 meses)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={d.serie_mov}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <RTooltip />
                <Line type="monotone" dataKey="admissoes" name="Admissões" stroke="#27AE60" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="desligamentos" name="Desligamentos" stroke="#E74C3C" strokeWidth={2} dot={false} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="glass-card border-0">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Composição por regime</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                     innerRadius={45} outerRadius={80} paddingAngle={3}>
                  {pieData.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                </Pie>
                <RTooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {custo && (
          <Card className="glass-card border-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Última competência ({custo.mes} · {custo.status})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Linha rotulo="Colaboradores na folha" valor={String(custo.headcount)} />
              <Linha rotulo="Folha (a pagar)" valor={fmtBRL(custo.folha)} />
              <Linha rotulo="Provisões (13º, férias, FGTS…)" valor={fmtBRL(custo.provisoes)} />
              <Linha rotulo="INSS patronal" valor={fmtBRL(custo.patronal)} />
              <div className="border-t pt-2">
                <Linha rotulo="Custo total de pessoal" valor={fmtBRL(custo.custo_total)} bold />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function KpiCard({ rotulo, valor, tom, destaque }: {
  rotulo: string; valor: string; tom?: string; destaque?: boolean;
}) {
  return (
    <Card className={`glass-card border-0 ${destaque ? "ring-1 ring-[hsl(var(--dunatech-blue))]/30" : ""}`}>
      <CardContent className="pb-3 pt-4 text-center">
        <div className={`font-mono text-lg font-bold ${tom || "text-foreground"}`}>{valor}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{rotulo}</div>
      </CardContent>
    </Card>
  );
}

function Linha({ rotulo, valor, bold }: { rotulo: string; valor: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className={`font-mono ${bold ? "text-base font-bold text-[hsl(var(--dunatech-blue))]" : ""}`}>{valor}</span>
    </div>
  );
}
