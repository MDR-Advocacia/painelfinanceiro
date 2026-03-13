import { Card, CardContent } from "@/components/ui/card";
import { useApp } from "@/contexts/AppContext";
import { calcResumo, formatCurrency, formatPercent, getStatusLabel, getStatusColor } from "@/utils/calculations";
import { Badge } from "@/components/ui/badge";

export function SectorSummary() {
  // Puxamos o currentVpdValor configurado na tela de Gestão Estratégica
  const { activePeriodoData, activeSetor, currentVpdValor } = useApp();
  
  if (!activePeriodoData || !activeSetor) return null;

  // O cálculo agora considera o VPD (ex: R$ 2.472,85) para achar o ROF real
  const r = calcResumo(activePeriodoData, currentVpdValor);

  if (r.faturamentoBruto === 0 && r.totalCustoPessoal === 0) return null;

  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardContent className="pt-6">
        <h3 className="font-heading text-sm font-semibold mb-4 flex items-center gap-2">
          Análise de Eficiência (ROF) — {activeSetor.nome}
          <Badge variant="outline" className={`${getStatusColor(r.status)} text-xs`}>
            {getStatusLabel(r.status)}
          </Badge>
        </h3>
        
        {/* Transformamos o grid em 5 colunas para mostrar a "Cascata" completa */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Metric 
            label="Faturamento Bruto" 
            value={formatCurrency(r.faturamentoBruto)} 
          />
          
          <Metric 
            label="Total Impostos" 
            value={formatCurrency(r.impostos.total)} 
            sub={formatPercent(r.cargaTributaria)} 
            color="text-warning"
          />
          
          <Metric 
            label="Custos Diretos (Pessoal)" 
            value={formatCurrency(r.totalCustoPessoal)} 
            sub={`${r.headcount} colab.`}
            color="text-destructive"
          />
          
          {/* Nova métrica que reflete as despesas indiretas baseadas no VPD */}
          <Metric 
            label="Despesas Indiretas (VPD)" 
            value={formatCurrency(r.custoVPD)} 
            sub={`Rateio Estrutural`}
            color="text-destructive"
          />

          <Metric 
            label="Variáveis do C. Custo" 
            value={formatCurrency(r.totalVariaveis)} 
            color="text-destructive" 
          />
          
          {/* O Resultado Operacional Final (Lucro Líquido) com destaque */}
          <div className="col-span-2 md:col-span-1 border-l pl-4 border-primary/20">
            <Metric
              label="Lucro Líquido (ROF)"
              value={formatCurrency(r.lucroLiquidoReal)}
              sub={`Margem: ${formatPercent(r.margemLiquidaPercent)}`}
              highlight={r.lucroLiquidoReal >= 0 ? 'positive' : 'negative'}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Pequeno ajuste no Metric para aceitar a propriedade 'color' e facilitar a leitura visual
function Metric({ label, value, sub, highlight, color }: { label: string; value: string; sub?: string; highlight?: 'positive' | 'negative', color?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-mono text-sm font-semibold mt-0.5 ${highlight === 'positive' ? 'text-success' : highlight === 'negative' ? 'text-destructive' : color || 'text-foreground'}`}>
        {value}
      </p>
      {sub && <p className="text-[10px] font-mono text-muted-foreground font-medium">{sub}</p>}
    </div>
  );
}