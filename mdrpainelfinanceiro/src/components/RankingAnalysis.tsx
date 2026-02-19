import { useApp } from "@/contexts/AppContext";
import { getSetorResumoForPeriod, formatCurrency, formatPercent, getStatusColor, getStatusLabel } from "@/utils/calculations";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PeriodSelector } from "@/components/PeriodSelector";
import type { ViewMode } from "@/types/sector";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer,
} from "recharts";
import { BarChart3 } from "lucide-react";

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

export function RankingAnalysis() {
  const { setores, setActiveSetor, periodoAtivo, setPeriodoAtivo, viewMode, setViewMode } = useApp();

  const resumos = setores
    .map(s => ({ setor: s, resumo: getSetorResumoForPeriod(s, periodoAtivo, viewMode) }))
    .filter(r => r.resumo.faturamentoBruto > 0);

  const byMargem = [...resumos].sort((a, b) => b.resumo.margemBrutaPercent - a.resumo.margemBrutaPercent);
  const byFaturamento = [...resumos].sort((a, b) => b.resumo.faturamentoBruto - a.resumo.faturamentoBruto);
  const byCustoPerReal = [...resumos]
    .map(r => ({
      ...r,
      custoPerReal: r.resumo.faturamentoBruto > 0 ? r.resumo.totalCustoPessoal / r.resumo.faturamentoBruto : 0,
    }))
    .sort((a, b) => a.custoPerReal - b.custoPerReal);

  const chartData = byMargem.map(r => ({
    name: r.setor.nome.length > 14 ? r.setor.nome.slice(0, 14) + '…' : r.setor.nome,
    "Margem (%)": Number(r.resumo.margemBrutaPercent.toFixed(1)),
  }));

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-heading text-2xl font-bold text-foreground">Análise de Rentabilidade</h2>
          <p className="text-sm text-muted-foreground mt-1">Rankings comparativos entre setores</p>
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
          <PeriodSelector value={periodoAtivo} onChange={setPeriodoAtivo} />
        </div>
      </div>

      {resumos.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <BarChart3 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="font-heading text-lg font-semibold text-muted-foreground">Sem dados para análise</h3>
            <p className="text-sm text-muted-foreground/60 mt-1">Cadastre setores com faturamento para visualizar rankings</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {chartData.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <h4 className="font-heading text-sm font-semibold mb-4">Ranking de Margem Bruta (%)</h4>
                <ResponsiveContainer width="100%" height={Math.max(200, resumos.length * 50)}>
                  <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 90%)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} unit="%" />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                    <RTooltip formatter={(v: number) => `${v}%`} />
                    <Bar dataKey="Margem (%)" fill="#1F4E78" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <div className="grid md:grid-cols-3 gap-4">
            <RankingCard
              title="🏆 Por Margem Bruta"
              items={byMargem.map((r, i) => ({
                pos: i + 1,
                name: r.setor.nome,
                primary: formatPercent(r.resumo.margemBrutaPercent),
                secondary: formatCurrency(r.resumo.margemBruta),
                status: r.resumo.status,
                onClick: () => setActiveSetor(r.setor.id),
              }))}
            />
            <RankingCard
              title="💰 Por Faturamento"
              items={byFaturamento.map((r, i) => ({
                pos: i + 1,
                name: r.setor.nome,
                primary: formatCurrency(r.resumo.faturamentoBruto),
                secondary: `Líq: ${formatCurrency(r.resumo.faturamentoLiquido)}`,
                status: r.resumo.status,
                onClick: () => setActiveSetor(r.setor.id),
              }))}
            />
            <RankingCard
              title="⚡ Custo por R$ Faturado"
              items={byCustoPerReal.map((r, i) => ({
                pos: i + 1,
                name: r.setor.nome,
                primary: `R$ ${r.custoPerReal.toFixed(2)}`,
                secondary: formatCurrency(r.resumo.totalCustoPessoal),
                status: r.resumo.status,
                onClick: () => setActiveSetor(r.setor.id),
              }))}
            />
          </div>
        </>
      )}
    </div>
  );
}

function RankingCard({ title, items }: {
  title: string;
  items: { pos: number; name: string; primary: string; secondary: string; status: string; onClick: () => void }[];
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <h4 className="font-heading text-sm font-semibold mb-3">{title}</h4>
        <div className="space-y-2">
          {items.map(item => (
            <div
              key={item.pos}
              onClick={item.onClick}
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
            >
              <span className={`text-sm font-bold w-6 text-center ${item.pos <= 3 ? 'text-primary' : 'text-muted-foreground'}`}>
                {item.pos}º
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.name}</p>
                <p className="text-[10px] text-muted-foreground">{item.secondary}</p>
              </div>
              <span className="font-mono text-xs font-semibold text-foreground">{item.primary}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
