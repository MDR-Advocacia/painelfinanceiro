import { useApp } from "@/contexts/AppContext";
import { getSetorResumo, formatCurrency, formatPercent } from "@/utils/calculations";
import { Card, CardContent } from "@/components/ui/card";
import { PeriodSelector } from "@/components/PeriodSelector";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { TrendingUp } from "lucide-react";
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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-heading text-2xl font-bold text-foreground">Projeções Financeiras</h2>
          <p className="text-sm text-muted-foreground mt-1">Projeção acumulada com base nos dados do período selecionado</p>
        </div>
        <PeriodSelector value={periodoAtivo} onChange={setPeriodoAtivo} />
      </div>

      {setores.length === 0 || totalFaturamento === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <TrendingUp className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="font-heading text-lg font-semibold text-muted-foreground">Sem dados para projeção</h3>
            <p className="text-sm text-muted-foreground/60 mt-1">Cadastre setores com faturamento para visualizar projeções</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PERIODS.map(p => (
              <Card key={p.months}>
                <CardContent className="pt-5 pb-4">
                  <p className="text-xs text-muted-foreground font-medium mb-2">Projeção {p.label}</p>
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

          <Card>
            <CardContent className="pt-6">
              <h4 className="font-heading text-sm font-semibold mb-4">Evolução Acumulada (12 meses)</h4>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={projectionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 90%)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <RTooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                  <Line type="monotone" dataKey="Faturamento" stroke="#1F4E78" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Custos" stroke="#E74C3C" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Impostos" stroke="#F39C12" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Margem Acum." stroke="#27AE60" strokeWidth={2.5} dot={false} strokeDasharray="6 3" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h4 className="font-heading text-sm font-semibold mb-4">Projeção por Setor (12 meses)</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 text-xs font-medium">Setor</th>
                      <th className="text-right py-2 text-xs font-medium">3 meses</th>
                      <th className="text-right py-2 text-xs font-medium">6 meses</th>
                      <th className="text-right py-2 text-xs font-medium">12 meses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumos.map(({ setor, resumo }) => {
                      const margem = resumo.margemBruta;
                      return (
                        <tr key={setor.id} className="border-b border-border/50">
                          <td className="py-2 font-medium">{setor.nome}</td>
                          {[3, 6, 12].map(m => (
                            <td key={m} className={`py-2 text-right font-mono text-xs ${margem >= 0 ? 'text-success' : 'text-destructive'}`}>
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
