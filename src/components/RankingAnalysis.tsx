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
import { BarChart3, Coins, Gauge, Trophy } from "lucide-react";
import { PageHeader, SectionTitle, SegButtons, Vazio } from "@/components/Pagina";

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
      <PageHeader
        eyebrow="Comparativo"
        titulo="Rentabilidade"
        descricao="Quem sustenta o escritório e quem consome — ranking por margem, faturamento e custo."
        acoes={<>
          <SegButtons
            valor={viewMode}
            onChange={(m) => setViewMode(m as ViewMode)}
            opcoes={(['mensal', 'trimestral', 'semestral', 'anual'] as ViewMode[]).map((m) => ({ v: m, label: VIEW_MODE_LABELS[m] }))}
          />
          <PeriodSelector value={periodoAtivo} onChange={setPeriodoAtivo} />
        </>}
      />

      {resumos.length === 0 ? (
        <Vazio
          icone={BarChart3}
          titulo="Sem dados para análise"
          texto="O ranking aparece assim que houver faturamento lançado em pelo menos um setor no período."
        />
      ) : (
        <>
          {chartData.length > 0 && (
            <Card className="glass-card border-0">
              <CardContent className="pt-6">
                <SectionTitle eyebrow="Ranking" titulo="Margem bruta por setor"
                              acoes={<span className="text-xs text-muted-foreground">quanto sobra de cada real faturado</span>} />
                <ResponsiveContainer width="100%" height={Math.max(200, resumos.length * 50)}>
                  <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11 }} unit="%" />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                    <RTooltip formatter={(v: number) => `${v}%`} />
                    <Bar dataKey="Margem (%)" fill="#1E7BFF" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <div className="grid md:grid-cols-3 gap-4">
            <RankingCard
              icone={Trophy}
              eyebrow="Eficiência"
              title="Por margem bruta"
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
              icone={Coins}
              eyebrow="Volume"
              title="Por faturamento"
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
              icone={Gauge}
              eyebrow="Custo"
              title="Custo por R$ faturado"
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

/**
 * Cartão de ranking. As três primeiras posições ganham medalha (o pódio é o
 * que o olho procura primeiro); da quarta em diante, número discreto.
 */
function RankingCard({ title, eyebrow, icone: Icone, items }: {
  title: string;
  eyebrow?: string;
  icone?: React.ElementType;
  items: { pos: number; name: string; primary: string; secondary: string; status: string; onClick: () => void }[];
}) {
  const medalha = ["bg-amber-400/15 text-amber-500 ring-amber-400/40",
                   "bg-slate-300/20 text-slate-400 ring-slate-300/40",
                   "bg-orange-400/15 text-orange-500 ring-orange-400/40"];
  return (
    <Card className="glass-card border-0">
      <CardContent className="pb-4 pt-5">
        <div className="mb-3 flex items-center gap-2">
          {Icone && (
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[hsl(var(--dunatech-blue))]/10">
              <Icone className="h-3.5 w-3.5 text-[hsl(var(--dunatech-blue))]" strokeWidth={2} />
            </span>
          )}
          <div>
            {eyebrow && <p className="eyebrow text-[0.6rem]">{eyebrow}</p>}
            <h4 className="font-heading text-sm font-semibold">{title}</h4>
          </div>
        </div>
        <div className="space-y-1">
          {items.map((item) => (
            <div
              key={item.pos}
              onClick={item.onClick}
              title="Abrir o setor"
              className="group flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 transition-colors hover:border-[hsl(var(--dunatech-blue))]/30 hover:bg-[hsl(var(--dunatech-blue))]/5"
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.65rem] font-bold ring-1 ${
                  item.pos <= 3 ? medalha[item.pos - 1] : "bg-muted/70 text-muted-foreground ring-transparent"
                }`}
              >
                {item.pos}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium group-hover:text-[hsl(var(--dunatech-blue))]">{item.name}</p>
                <p className="truncate text-[0.65rem] text-muted-foreground">{item.secondary}</p>
              </div>
              <span className="font-mono-numbers text-xs font-bold">{item.primary}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
