import { Card, CardContent } from "@/components/ui/card";
import { useApp } from "@/contexts/AppContext";
import { calcResumo, formatCurrency, formatPercent, getStatusLabel, getStatusColor } from "@/utils/calculations";
import { Badge } from "@/components/ui/badge";

export function SectorSummary() {
  const { activePeriodoData, activeSetor, getRateioPerSetor, periodoAtivo } = useApp();
  if (!activePeriodoData || !activeSetor) return null;

  const r = calcResumo(activePeriodoData);
  const rateioEstrutura = activeSetor.sedeId ? getRateioPerSetor(activeSetor.sedeId, periodoAtivo) : 0;

  if (r.faturamentoBruto === 0 && r.totalCustoPessoal === 0) return null;

  const margemComEstrutura = r.margemBruta - rateioEstrutura;
  const margemComEstruturaPercent = r.faturamentoBruto > 0 ? (margemComEstrutura / r.faturamentoBruto) * 100 : 0;

  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardContent className="pt-6">
        <h3 className="font-heading text-sm font-semibold mb-4 flex items-center gap-2">
          Resumo Financeiro — {activeSetor.nome}
          <Badge variant="outline" className={`${getStatusColor(r.status)} text-xs`}>
            {getStatusLabel(r.status)}
          </Badge>
        </h3>
        <div className={`grid grid-cols-2 ${rateioEstrutura > 0 ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-4`}>
          <Metric label="Faturamento Bruto" value={formatCurrency(r.faturamentoBruto)} />
          <Metric label="Total Impostos" value={formatCurrency(r.impostos.total)} sub={formatPercent(r.cargaTributaria)} />
          <Metric label="Custos de Pessoal" value={formatCurrency(r.totalCustoPessoal)} />
          {rateioEstrutura > 0 && (
            <Metric label="Rateio Estrutura" value={formatCurrency(rateioEstrutura)} />
          )}
          <Metric
            label={rateioEstrutura > 0 ? "Margem (c/ Estrutura)" : "Margem Bruta"}
            value={formatCurrency(rateioEstrutura > 0 ? margemComEstrutura : r.margemBruta)}
            sub={formatPercent(rateioEstrutura > 0 ? margemComEstruturaPercent : r.margemBrutaPercent)}
            highlight={(rateioEstrutura > 0 ? margemComEstrutura : r.margemBruta) >= 0 ? 'positive' : 'negative'}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: 'positive' | 'negative' }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-mono text-sm font-semibold mt-0.5 ${highlight === 'positive' ? 'text-success' : highlight === 'negative' ? 'text-destructive' : 'text-foreground'}`}>
        {value}
      </p>
      {sub && <p className="text-[10px] font-mono text-muted-foreground">{sub}</p>}
    </div>
  );
}
