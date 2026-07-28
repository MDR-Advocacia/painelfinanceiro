import { useApp } from "@/contexts/AppContext";
import { getSetorResumo, formatCurrency, formatPercent } from "@/utils/calculations";
import { Card, CardContent } from "@/components/ui/card";
import { PeriodSelector } from "@/components/PeriodSelector";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { PageHeader, SectionTitle, Vazio } from "@/components/Pagina";
import { MONTH_NAMES } from "@/types/sector";

const PERIODS = [
  { label: "3 meses", months: 3 },
  { label: "6 meses", months: 6 },
  { label: "12 meses", months: 12 },
];

export function Projections() {
  const { setores, periodoAtivo, setPeriodoAtivo } = useApp();

  // Calculate using active period data
  const resumos = setores.map(s => ({ setor: s, resumo: getSetorResumo(s, periodoAtivo) }));
  const totalFaturamento = resumos.reduce((a, r) => a + r.resumo.faturamentoBruto, 0);
  const totalImpostos = resumos.reduce((a, r) => a + r.resumo.impostos.total, 0);
  const totalCustos = resumos.reduce((a, r) => a + r.resumo.totalCustoPessoal, 0);
  const margemMensal = totalFaturamento - totalImpostos - totalCustos;

  // Build historical + projection data
  const [year, month] = periodoAtivo.split('-').map(Number);
  const projectionData = Array.from({ length: 13 }, (_, i) => ({
    mes: `Mês ${i}`,
    Faturamento: totalFaturamento * i,
    Custos: totalCustos * i,
    Impostos: totalImpostos * i,
    "Margem Acum.": margemMensal * i,
  }));

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        eyebrow="Olhando pra frente"
        titulo="Projeções"
        descricao="Acumulado projetado a partir do que já foi lançado no período selecionado."
        acoes={<PeriodSelector value={periodoAtivo} onChange={setPeriodoAtivo} />}
      />

      {setores.length === 0 || totalFaturamento === 0 ? (
        <Vazio
          icone={TrendingUp}
          titulo="Sem dados para projetar"
          texto="A projeção parte do faturamento lançado — cadastre ao menos um setor com receita no período."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PERIODS.map(p => (
              <Card key={p.months} className="glass-card card-hover border-0">
                <CardContent className="pb-4 pt-5">
                  <p className="eyebrow mb-3">Projeção {p.label}</p>
                  <div className="space-y-1.5">
                    <Row label="Faturamento" value={formatCurrency(totalFaturamento * p.months)} />
                    <Row label="Impostos" value={formatCurrency(totalImpostos * p.months)} color="text-warning" />
                    <Row label="Custos Pessoal" value={formatCurrency(totalCustos * p.months)} />
                    <div className="border-t pt-1.5 mt-1.5">
                      <Row label="Margem Bruta" value={formatCurrency(margemMensal * p.months)} color={margemMensal >= 0 ? 'text-success' : 'text-destructive'} bold />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="glass-card border-0">
            <CardContent className="pt-6">
              <SectionTitle eyebrow="Horizonte" titulo="Evolução acumulada em 12 meses"
                            acoes={<span className="text-xs text-muted-foreground">linha tracejada = margem acumulada</span>} />
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={projectionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <RTooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                  <Line type="monotone" dataKey="Faturamento" stroke="#1E7BFF" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Custos" stroke="#E74C3C" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Impostos" stroke="#F39C12" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Margem Acum." stroke="#27AE60" strokeWidth={2.5} dot={false} strokeDasharray="6 3" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="glass-card border-0">
            <CardContent className="pt-6">
              <SectionTitle eyebrow="Por setor" titulo="Margem projetada"
                            acoes={<span className="text-xs text-muted-foreground">mantendo o ritmo do período</span>} />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="eyebrow py-2 text-left">Setor</th>
                      <th className="eyebrow py-2 text-right">3 meses</th>
                      <th className="eyebrow py-2 text-right">6 meses</th>
                      <th className="eyebrow py-2 text-right">12 meses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumos.map(({ setor, resumo }) => {
                      const margem = resumo.margemBruta;
                      return (
                        <tr key={setor.id}
                            className="border-b border-border/50 border-l-2 border-l-transparent transition-colors last:border-b-0 hover:border-l-[hsl(var(--dunatech-blue))] hover:bg-[hsl(var(--dunatech-blue))]/5">
                          <td className="py-2 pl-2 font-medium">{setor.nome}</td>
                          {[3, 6, 12].map((m) => (
                            <td key={m} className={`py-2 text-right font-mono-numbers text-xs ${margem >= 0 ? "text-success" : "text-destructive"}`}>
                              {formatCurrency(margem * m)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Row({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? 'font-semibold' : ''}`}>
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`font-mono text-xs ${color || 'text-foreground'}`}>{value}</span>
    </div>
  );
}
